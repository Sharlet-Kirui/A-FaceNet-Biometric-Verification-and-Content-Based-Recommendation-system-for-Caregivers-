// /recommendations: ranked job matches, express interest, my applications, ways to get more matches (caregiver JWT).
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const rec = require('../services/recommender');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s || '');

function sendError(res, err) {
  if (err.code === 'not_verified') return res.status(403).json({ error: err.message, reason: 'not_verified' });
  if (err.code === 'not_found') return res.status(404).json({ error: err.message });
  throw err;
}

// GET /recommendations?limit=10&method=binary|weighted
router.get('/', requireAuth, wrap(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const method = rec.METHODS.includes(req.query.method) ? req.query.method : 'binary';
  try {
    const matches = await rec.recommend(db, req.caregiverId, { method, limit });
    res.json({ method, count: matches.length, matches });
  } catch (err) {
    sendError(res, err);
  }
}));

// GET /recommendations/interests  (defined before /:jobId routes)
router.get('/interests', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT job_id, match_score, reasons, matched_at, status FROM job_matches
      WHERE caregiver_id = $1 AND status IN ('interested', 'shortlisted', 'declined') ORDER BY matched_at DESC`, [req.caregiverId]);
  const vocab = await rec.loadVocabulary(db);
  const caregiver = await rec.loadCaregiver(db, req.caregiverId);
  const interests = [];
  for (const r of rows) {
    const job = await rec.loadJob(db, r.job_id);
    if (!job) continue;
    // re-scored so held/missing skills reflect the caregiver's current profile
    const m = rec.scoreJob(caregiver, job, vocab, { ignoreFilters: true });
    // status: interested (waiting), shortlisted or declined (set by an administrator)
    interests.push({ ...rec.present({ ...m, score: Number(r.match_score) }, r.status),
      jobStatus: job.status, interestedAt: r.matched_at });
  }
  res.json({ count: interests.length, interests });
}));

// GET /recommendations/insights  -> concrete ways to reach more jobs ("Room to grow")
//   skills:  skills most often required by open jobs in the caregiver's county that they do not list
//   shifts:  open jobs in the county on shifts the caregiver has not made themselves available for
//   experience: open jobs in the county that need more years than they have
router.get('/insights', requireAuth, wrap(async (req, res) => {
  const caregiver = await rec.loadCaregiver(db, req.caregiverId);
  if (!caregiver) return res.status(404).json({ error: 'Caregiver not found' });
  const vocab = await rec.loadVocabulary(db);
  const county = (j) => String(j.county).trim().toLowerCase() === String(caregiver.county || '').trim().toLowerCase();
  const local = (await rec.loadOpenJobs(db)).filter(county);
  const held = new Set(caregiver.skills.map((s) => s.skill_tag_id));
  const exp = Number(caregiver.experience_years ?? 0);

  const skillCounts = new Map();
  const shiftCounts = new Map();
  let needMoreExperience = 0;
  for (const j of local) {
    if (exp < Number(j.min_experience_years)) { needMoreExperience++; continue; }
    if (!caregiver.shifts.has(j.shift)) { shiftCounts.set(j.shift, (shiftCounts.get(j.shift) || 0) + 1); continue; }
    for (const r of j.requirements) {
      if (!held.has(r.skill_tag_id)) skillCounts.set(r.skill_tag_id, (skillCounts.get(r.skill_tag_id) || 0) + 1);
    }
  }
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  res.json({
    county: caregiver.county,
    openJobsInCounty: local.length,
    skills: top(skillCounts, 3).map(([id, jobs]) => ({ skill: vocab.byId.get(id)?.skill_name ?? id,
      category: vocab.byId.get(id)?.category, jobs })),
    shifts: top(shiftCounts, 3).map(([shift, jobs]) => ({ shift, jobs })),
    needMoreExperience,
  });
}));

// POST /recommendations/:jobId/interest
router.post('/:jobId/interest', requireAuth, wrap(async (req, res) => {
  if (!isUuid(req.params.jobId)) return res.status(404).json({ error: 'Job not found' });
  const caregiver = await rec.loadCaregiver(db, req.caregiverId);
  if (!caregiver) return res.status(404).json({ error: 'Caregiver not found' });
  if (caregiver.onboarding_status !== 'verified') {
    return res.status(403).json({ error: 'You can express interest once your identity is verified', reason: 'not_verified' });
  }
  const job = await rec.loadJob(db, req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'open') return res.status(409).json({ error: 'This job is no longer open', reason: 'job_closed' });

  const vocab = await rec.loadVocabulary(db);
  const m = rec.scoreJob(caregiver, job, vocab);
  if (!m) return res.status(409).json({ error: 'This job does not match your county, experience or availability', reason: 'filters_failed' });

  await db.query(
    `INSERT INTO job_matches (caregiver_id, job_id, match_score, reasons, status)
     VALUES ($1, $2, $3, $4, 'interested')
     ON CONFLICT (caregiver_id, job_id) DO UPDATE
       SET status = CASE WHEN job_matches.status IN ('shortlisted', 'declined') THEN job_matches.status ELSE 'interested' END,
           matched_at = CASE WHEN job_matches.status IN ('shortlisted', 'declined') THEN job_matches.matched_at ELSE now() END`,
    [req.caregiverId, job.job_id, m.score,
      JSON.stringify({ method: 'binary', reasons: m.reasons, held: m.held, missing: m.missing })]);
  res.status(201).json({ ...rec.present(m, 'interested'), message: 'Interest recorded. The family or agency will contact you if shortlisted.' });
}));

module.exports = router;
