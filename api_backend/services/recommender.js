/**
 * Content-based job recommender (proposal 3.2.2).
 *
 *   1. Vocabulary: every skill_tags row is one dimension, in a fixed order.
 *   2. SkillVector: the caregiver's skills over that vocabulary.
 *        binary   (main method)  1 if the caregiver holds the skill, else 0
 *        weighted (variant)      proficiency / 5
 *      The job's requirement vector is built the same way:
 *        binary 1 per required skill; weighted = the requirement's importance (0-1).
 *   3. Hard filters, applied before scoring (a job that fails any is never shown):
 *        caregiver verified, job open, same county, experience >= the job's minimum,
 *        the job's shift in the caregiver's availability.
 *   4. Score = cosine similarity of the two vectors (0-1, since all entries are >= 0).
 *   5. Ranked by score, then by more required skills held, then newest job.
 *
 * Pure functions are exported for unit tests and for ml_eval/evaluate_recommender.js;
 * the database functions at the bottom serve the /recommendations endpoints.
 */

const METHODS = ['binary', 'weighted'];

// ---------------------------------------------------------------- vectors
/** vocab: [{ skill_tag_id, skill_name, category }] in a fixed order -> { ids, index, byId } */
function buildVocabulary(tags) {
  const ids = tags.map((t) => t.skill_tag_id);
  return {
    ids,
    index: new Map(ids.map((id, i) => [id, i])),
    byId: new Map(tags.map((t) => [t.skill_tag_id, t])),
  };
}

/** skills: [{ skill_tag_id, proficiency_level }] */
function caregiverVector(skills, vocab, method = 'binary') {
  const v = new Array(vocab.ids.length).fill(0);
  for (const s of skills) {
    const i = vocab.index.get(s.skill_tag_id);
    if (i === undefined) continue;
    v[i] = method === 'weighted' ? clamp01((s.proficiency_level ?? 3) / 5) : 1;
  }
  return v;
}

/** requirements: [{ skill_tag_id, importance }] */
function jobVector(requirements, vocab, method = 'binary') {
  const v = new Array(vocab.ids.length).fill(0);
  for (const r of requirements) {
    const i = vocab.index.get(r.skill_tag_id);
    if (i === undefined) continue;
    v[i] = method === 'weighted' ? clamp01(Number(r.importance ?? 1)) : 1;
  }
  return v;
}

/** Cosine similarity; 0 when either vector is all zeros. */
function cosine(a, b) {
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Keyword baseline used only in the evaluation: number of required skills the caregiver holds. */
function sharedTagCount(skills, requirements) {
  const held = new Set(skills.map((s) => s.skill_tag_id));
  return requirements.filter((r) => held.has(r.skill_tag_id)).length;
}

// ---------------------------------------------------------------- filters
/**
 * caregiver: { onboarding_status, county, experience_years, shifts: Set<string> }
 * job:       { status, county, min_experience_years, shift }
 * Returns { pass, checks: { verified, open, county, experience, shift } }
 */
function hardFilters(caregiver, job) {
  const checks = {
    verified: caregiver.onboarding_status === 'verified',
    open: job.status === 'open',
    county: norm(caregiver.county) !== '' && norm(caregiver.county) === norm(job.county),
    experience: Number(caregiver.experience_years ?? 0) >= Number(job.min_experience_years ?? 0),
    shift: caregiver.shifts instanceof Set && caregiver.shifts.has(job.shift),
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

// ---------------------------------------------------------------- scoring + reasons
const SHIFT_LABEL = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night', live_in: 'Live-in' };

/** Plain-language explanation shown to the caregiver and stored in job_matches.reasons. */
function explain(caregiver, job, held, missing) {
  const total = held.length + missing.length;
  const reasons = [`You have ${held.length} of ${total} required skills`];
  reasons.push(`Located in ${job.county}, your county`);
  if (Number(job.min_experience_years) > 0) {
    reasons.push(`Needs ${job.min_experience_years}+ years of experience; you have ${caregiver.experience_years}`);
  }
  reasons.push(`${SHIFT_LABEL[job.shift] || job.shift} shift matches your availability`);
  return reasons;
}

/**
 * Scores one job for one caregiver. Returns null if a hard filter fails
 * (unless ignoreFilters, used by the evaluation's ablation).
 */
function scoreJob(caregiver, job, vocab, { method = 'binary', ignoreFilters = false } = {}) {
  const filter = hardFilters(caregiver, job);
  if (!filter.pass && !ignoreFilters) return null;
  const score = cosine(caregiverVector(caregiver.skills, vocab, method), jobVector(job.requirements, vocab, method));
  const heldIds = new Set(caregiver.skills.map((s) => s.skill_tag_id));
  const name = (id) => vocab.byId.get(id)?.skill_name ?? id;
  const held = job.requirements.filter((r) => heldIds.has(r.skill_tag_id)).map((r) => name(r.skill_tag_id));
  const missing = job.requirements.filter((r) => !heldIds.has(r.skill_tag_id)).map((r) => name(r.skill_tag_id));
  return {
    job,
    score: round4(score),
    held,
    missing,
    filters: filter.checks,
    reasons: filter.pass ? explain(caregiver, job, held, missing) : [],
  };
}

/** Score desc, then more held skills, then newest job, then id (deterministic). */
function compareMatches(a, b) {
  return b.score - a.score
    || b.held.length - a.held.length
    || new Date(b.job.created_at || 0) - new Date(a.job.created_at || 0)
    || String(a.job.job_id).localeCompare(String(b.job.job_id));
}

/** Ranks all jobs for a caregiver; jobs with no shared skill (score 0) are left out. */
function rankJobs(caregiver, jobs, vocab, opts = {}) {
  return jobs
    .map((j) => scoreJob(caregiver, j, vocab, opts))
    .filter((m) => m && m.score > 0)
    .sort(compareMatches)
    .map((m, i) => ({ ...m, rank: i + 1 }));
}

// ---------------------------------------------------------------- database
async function loadVocabulary(db) {
  const { rows } = await db.query(
    'SELECT skill_tag_id, skill_name, category FROM skill_tags ORDER BY category, skill_name, skill_tag_id');
  return buildVocabulary(rows);
}

async function loadCaregiver(db, caregiverId) {
  const c = (await db.query(
    `SELECT caregiver_id, onboarding_status, county, experience_years FROM caregivers WHERE caregiver_id = $1`,
    [caregiverId])).rows[0];
  if (!c) return null;
  const skills = (await db.query(
    'SELECT skill_tag_id, proficiency_level FROM caregiver_skills WHERE caregiver_id = $1', [caregiverId])).rows;
  const shifts = (await db.query(
    'SELECT DISTINCT shift FROM caregiver_availability WHERE caregiver_id = $1', [caregiverId])).rows;
  return { ...c, skills, shifts: new Set(shifts.map((s) => s.shift)) };
}

const JOB_SELECT = `
  SELECT j.job_id, j.title, j.description, c.name AS category, j.county, j.location_detail, j.job_type,
         j.shift, j.min_experience_years, j.salary_min_kes, j.salary_max_kes, j.status, j.created_at,
         COALESCE(json_agg(json_build_object('skill_tag_id', r.skill_tag_id, 'importance', r.importance,
                  'required_proficiency', r.required_proficiency)) FILTER (WHERE r.skill_tag_id IS NOT NULL),
                  '[]') AS requirements
    FROM job_postings j
    JOIN job_categories c USING (category_id)
    LEFT JOIN job_skill_requirements r USING (job_id)`;

async function loadOpenJobs(db) {
  return (await db.query(`${JOB_SELECT} WHERE j.status = 'open' GROUP BY j.job_id, c.name`)).rows;
}

async function loadJob(db, jobId) {
  return (await db.query(`${JOB_SELECT} WHERE j.job_id = $1 GROUP BY j.job_id, c.name`, [jobId])).rows[0];
}

/** API shape of one match. */
function present(m, status = 'suggested') {
  const j = m.job;
  return {
    jobId: j.job_id,
    title: j.title,
    description: j.description,
    category: j.category,
    county: j.county,
    locationDetail: j.location_detail,
    jobType: j.job_type,
    shift: j.shift,
    minExperienceYears: j.min_experience_years,
    salaryMinKes: j.salary_min_kes,
    salaryMaxKes: j.salary_max_kes,
    postedAt: j.created_at,
    matchScore: m.score,
    matchPercent: Math.round(m.score * 100),
    rank: m.rank ?? null,
    heldSkills: m.held,
    missingSkills: m.missing,
    reasons: m.reasons,
    status,
  };
}

let vectorCast; // 'vector' or 'real[]', read once
async function getVectorCast(db) {
  if (vectorCast) return vectorCast;
  const { rows } = await db.query(
    `SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'caregiver_skill_vectors' AND column_name = 'skill_vector'`);
  vectorCast = rows[0]?.udt_name === 'vector' ? 'vector' : 'real[]';
  return vectorCast;
}

/** Stores the caregiver's binary SkillVector (vocab_version = vocabulary size it was built on). */
async function saveSkillVector(db, caregiver, vocab) {
  const v = caregiverVector(caregiver.skills, vocab, 'binary');
  const cast = await getVectorCast(db);
  const literal = cast === 'vector' ? `[${v.join(',')}]` : `{${v.join(',')}}`;
  await db.query(
    `INSERT INTO caregiver_skill_vectors (caregiver_id, skill_vector, vocab_version, updated_at)
     VALUES ($1, $2::${cast}, $3, now())
     ON CONFLICT (caregiver_id) DO UPDATE SET skill_vector = EXCLUDED.skill_vector,
       vocab_version = EXCLUDED.vocab_version, updated_at = now()`,
    [caregiver.caregiver_id, literal, Math.min(vocab.ids.length, 32767)]);
}

/**
 * Computes, stores and returns the top `limit` matches for a caregiver.
 * Throws { code: 'not_verified' } for a caregiver who is not verified.
 */
async function recommend(db, caregiverId, { method = 'binary', limit = 10 } = {}) {
  const caregiver = await loadCaregiver(db, caregiverId);
  if (!caregiver) throw Object.assign(new Error('Caregiver not found'), { code: 'not_found' });
  if (caregiver.onboarding_status !== 'verified') {
    throw Object.assign(new Error('Recommendations are available once your identity is verified'), { code: 'not_verified' });
  }
  const vocab = await loadVocabulary(db);
  const ranked = rankJobs(caregiver, await loadOpenJobs(db), vocab, { method }).slice(0, limit);

  await saveSkillVector(db, caregiver, vocab);
  await db.transaction(async (c) => {
    // earlier suggestions lose their rank; interest and dismissals are kept
    await c.query(`UPDATE job_matches SET rank = NULL WHERE caregiver_id = $1`, [caregiverId]);
    for (const m of ranked) {
      await c.query(
        `INSERT INTO job_matches (caregiver_id, job_id, match_score, rank, reasons, status)
         VALUES ($1, $2, $3, $4, $5, 'suggested')
         ON CONFLICT (caregiver_id, job_id) DO UPDATE SET match_score = EXCLUDED.match_score,
           rank = EXCLUDED.rank, reasons = EXCLUDED.reasons, matched_at = now()`,
        [caregiverId, m.job.job_id, m.score, m.rank,
          JSON.stringify({ method, reasons: m.reasons, held: m.held, missing: m.missing })]);
    }
  });

  const statuses = (await db.query(
    'SELECT job_id, status FROM job_matches WHERE caregiver_id = $1 AND job_id = ANY($2)',
    [caregiverId, ranked.map((m) => m.job.job_id)])).rows;
  const statusOf = new Map(statuses.map((r) => [r.job_id, r.status]));
  return ranked.map((m) => present(m, statusOf.get(m.job.job_id)));
}

// ---------------------------------------------------------------- helpers
function clamp01(x) { return Math.min(1, Math.max(0, x)); }
function round4(x) { return Math.round(x * 10000) / 10000; }
function norm(s) { return String(s ?? '').trim().toLowerCase(); }

module.exports = {
  METHODS,
  buildVocabulary, caregiverVector, jobVector, cosine, sharedTagCount,
  hardFilters, scoreJob, rankJobs, compareMatches, explain,
  loadVocabulary, loadCaregiver, loadOpenJobs, loadJob, present, saveSkillVector, recommend,
};
