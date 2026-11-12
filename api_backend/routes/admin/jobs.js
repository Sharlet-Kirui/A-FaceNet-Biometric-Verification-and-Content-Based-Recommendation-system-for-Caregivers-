// Job postings (with skill requirements and interested caregivers) and job categories.
const express = require('express');
const db = require('../../db');
const { requireSuperAdmin } = require('../../middleware/adminAuth');
const { notify } = require('../../services/notify');
const { wrap, isUuid, page, audit } = require('./util');

const router = express.Router();
const JOB_TYPES = ['full_time', 'part_time', 'live_in', 'temporary'];
const SHIFTS = ['morning', 'afternoon', 'night', 'live_in'];
const JOB_STATUSES = ['draft', 'open', 'filled', 'closed'];
const APPLICANT_STATUSES = ['interested', 'shortlisted', 'declined'];

const num = (v) => (v == null ? null : Number(v));
const clean = (s) => (s == null ? '' : String(s).trim());

/** Validates a create/update body. Returns { job, errors }. */
function validateJob(b = {}) {
  const errors = {};
  const job = {
    title: clean(b.title),
    description: clean(b.description) || null,
    categoryId: b.categoryId,
    county: clean(b.county),
    locationDetail: clean(b.locationDetail) || null,
    jobType: b.jobType || 'full_time',
    shift: b.shift || 'morning',
    minExperienceYears: Number(b.minExperienceYears ?? 0),
    salaryMinKes: b.salaryMinKes === '' || b.salaryMinKes == null ? null : Number(b.salaryMinKes),
    salaryMaxKes: b.salaryMaxKes === '' || b.salaryMaxKes == null ? null : Number(b.salaryMaxKes),
    status: b.status || 'open',
    requirements: Array.isArray(b.requirements) ? b.requirements : [],
  };
  if (job.title.length < 3 || job.title.length > 150) errors.title = '3-150 characters';
  if (!isUuid(job.categoryId)) errors.categoryId = 'choose a category';
  if (!job.county) errors.county = 'required';
  if (!JOB_TYPES.includes(job.jobType)) errors.jobType = JOB_TYPES.join(', ');
  if (!SHIFTS.includes(job.shift)) errors.shift = SHIFTS.join(', ');
  if (!JOB_STATUSES.includes(job.status)) errors.status = JOB_STATUSES.join(', ');
  if (!Number.isInteger(job.minExperienceYears) || job.minExperienceYears < 0 || job.minExperienceYears > 60) {
    errors.minExperienceYears = 'whole years, 0-60';
  }
  for (const k of ['salaryMinKes', 'salaryMaxKes']) {
    if (job[k] != null && (!Number.isInteger(job[k]) || job[k] < 0)) errors[k] = 'whole shillings';
  }
  if (job.salaryMinKes != null && job.salaryMaxKes != null && job.salaryMaxKes < job.salaryMinKes) {
    errors.salaryMaxKes = 'must be at least the minimum';
  }
  const seen = new Set();
  job.requirements = job.requirements.map((r) => ({
    skillTagId: r?.skillTagId,
    importance: Number(r?.importance ?? 1),
    requiredProficiency: Number(r?.requiredProficiency ?? 3),
  }));
  for (const r of job.requirements) {
    if (!isUuid(r.skillTagId) || seen.has(r.skillTagId)) { errors.requirements = 'each skill once'; break; }
    seen.add(r.skillTagId);
    if (!(r.importance >= 0 && r.importance <= 1)) { errors.requirements = 'importance 0-1'; break; }
    if (!Number.isInteger(r.requiredProficiency) || r.requiredProficiency < 1 || r.requiredProficiency > 5) {
      errors.requirements = 'proficiency 1-5'; break;
    }
  }
  if (job.status === 'open' && job.requirements.length === 0) {
    errors.requirements = 'an open job needs at least one required skill, otherwise nobody can be matched';
  }
  return { job, errors };
}

async function saveRequirements(c, jobId, requirements) {
  await c.query('DELETE FROM job_skill_requirements WHERE job_id = $1', [jobId]);
  for (const r of requirements) {
    await c.query(
      `INSERT INTO job_skill_requirements (job_id, skill_tag_id, required_proficiency, importance) VALUES ($1, $2, $3, $4)`,
      [jobId, r.skillTagId, r.requiredProficiency, r.importance]);
  }
}

async function loadJob(jobId) {
  const job = (await db.query(
    `SELECT j.*, c.name AS category_name FROM job_postings j JOIN job_categories c USING (category_id) WHERE j.job_id = $1`,
    [jobId])).rows[0];
  if (!job) return null;
  const reqs = (await db.query(
    `SELECT r.skill_tag_id, t.skill_name, t.category, r.importance, r.required_proficiency
       FROM job_skill_requirements r JOIN skill_tags t USING (skill_tag_id)
      WHERE r.job_id = $1 ORDER BY r.importance DESC, t.skill_name`, [jobId])).rows;
  const interested = (await db.query(
    `SELECT m.caregiver_id, c.first_name, c.last_name, c.county, c.experience_years, c.phone, c.email,
            m.match_score, m.matched_at, m.status, t.score AS trust_score, t.is_verified,
            (SELECT d.document_id FROM kyc_documents d WHERE d.caregiver_id = m.caregiver_id AND d.doc_type = 'cv'
              ORDER BY d.created_at DESC LIMIT 1) AS cv_document_id,
            (SELECT d.mime_type FROM kyc_documents d WHERE d.caregiver_id = m.caregiver_id AND d.doc_type = 'cv'
              ORDER BY d.created_at DESC LIMIT 1) AS cv_mime_type
       FROM job_matches m JOIN caregivers c USING (caregiver_id)
       LEFT JOIN trust_scores t ON t.caregiver_id = m.caregiver_id
      WHERE m.job_id = $1 AND m.status = ANY($2)
      ORDER BY array_position($2::text[], m.status::text), m.match_score DESC`, [jobId, ['shortlisted', 'interested', 'declined']])).rows;
  return {
    jobId: job.job_id, title: job.title, description: job.description,
    categoryId: job.category_id, categoryName: job.category_name,
    county: job.county, locationDetail: job.location_detail, jobType: job.job_type, shift: job.shift,
    minExperienceYears: job.min_experience_years, salaryMinKes: job.salary_min_kes, salaryMaxKes: job.salary_max_kes,
    status: job.status, createdAt: job.created_at, updatedAt: job.updated_at,
    requirements: reqs.map((r) => ({ skillTagId: r.skill_tag_id, skillName: r.skill_name, category: r.category,
      importance: num(r.importance), requiredProficiency: r.required_proficiency })),
    interested: interested.map((i) => ({ caregiverId: i.caregiver_id, name: `${i.first_name} ${i.last_name}`,
      county: i.county, experienceYears: i.experience_years, phone: i.phone, email: i.email,
      matchScore: num(i.match_score), trustScore: num(i.trust_score), isVerified: i.is_verified, interestedAt: i.matched_at,
      status: i.status, cvDocumentId: i.cv_document_id, cvMimeType: i.cv_mime_type })),
  };
}

// ---------------------------------------------------------------- jobs
// GET /admin/jobs?status=&search=&categoryId=&limit=&offset=
router.get('/jobs', wrap(async (req, res) => {
  const { limit, offset } = page(req.query);
  const params = [];
  const where = [];
  if (JOB_STATUSES.includes(req.query.status)) { params.push(req.query.status); where.push(`j.status = $${params.length}`); }
  if (isUuid(req.query.categoryId)) { params.push(req.query.categoryId); where.push(`j.category_id = $${params.length}`); }
  if (clean(req.query.search)) {
    params.push(`%${clean(req.query.search).toLowerCase()}%`);
    where.push(`(lower(j.title) LIKE $${params.length} OR lower(j.county) LIKE $${params.length})`);
  }
  const { rows } = await db.query(
    `SELECT j.job_id, j.title, j.county, j.shift, j.job_type, j.status, j.salary_min_kes, j.salary_max_kes,
            j.min_experience_years, j.created_at, c.name AS category_name,
            (SELECT count(*) FROM job_skill_requirements r WHERE r.job_id = j.job_id)::int AS requirement_count,
            (SELECT count(*) FROM job_matches m WHERE m.job_id = j.job_id
               AND m.status IN ('interested', 'shortlisted', 'declined'))::int AS interested_count,
            count(*) OVER () AS total
       FROM job_postings j JOIN job_categories c USING (category_id)
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY j.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  res.json({
    total: Number(rows[0]?.total || 0),
    jobs: rows.map((j) => ({
      jobId: j.job_id, title: j.title, county: j.county, shift: j.shift, jobType: j.job_type, status: j.status,
      salaryMinKes: j.salary_min_kes, salaryMaxKes: j.salary_max_kes, minExperienceYears: j.min_experience_years,
      categoryName: j.category_name, requirementCount: j.requirement_count, interestedCount: j.interested_count,
      createdAt: j.created_at,
    })),
  });
}));

router.get('/jobs/:id', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Job not found' });
  const job = await loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
}));

router.post('/jobs', wrap(async (req, res) => {
  const { job, errors } = validateJob(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Validation failed', fields: errors });
  const jobId = await db.transaction(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO job_postings (title, description, category_id, county, location_detail, job_type, shift,
         min_experience_years, salary_min_kes, salary_max_kes, status, posted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING job_id`,
      [job.title, job.description, job.categoryId, job.county, job.locationDetail, job.jobType, job.shift,
        job.minExperienceYears, job.salaryMinKes, job.salaryMaxKes, job.status, req.adminId]);
    await saveRequirements(c, rows[0].job_id, job.requirements);
    await audit(c, req, { actionType: 'job_created', details: { jobId: rows[0].job_id, title: job.title } });
    return rows[0].job_id;
  }).catch((err) => {
    if (err.code === '23503') return null; // unknown category or skill
    throw err;
  });
  if (!jobId) return res.status(400).json({ error: 'Unknown category or skill', fields: { categoryId: 'check' } });
  res.status(201).json(await loadJob(jobId));
}));

router.put('/jobs/:id', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Job not found' });
  const { job, errors } = validateJob(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Validation failed', fields: errors });
  const found = await db.transaction(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE job_postings SET title=$2, description=$3, category_id=$4, county=$5, location_detail=$6, job_type=$7,
         shift=$8, min_experience_years=$9, salary_min_kes=$10, salary_max_kes=$11, status=$12 WHERE job_id = $1`,
      [req.params.id, job.title, job.description, job.categoryId, job.county, job.locationDetail, job.jobType,
        job.shift, job.minExperienceYears, job.salaryMinKes, job.salaryMaxKes, job.status]);
    if (!rowCount) return false;
    await saveRequirements(c, req.params.id, job.requirements);
    await audit(c, req, { actionType: 'job_updated', details: { jobId: req.params.id, title: job.title, status: job.status } });
    return true;
  }).catch((err) => {
    if (err.code === '23503') return 'fk';
    throw err;
  });
  if (found === 'fk') return res.status(400).json({ error: 'Unknown category or skill' });
  if (!found) return res.status(404).json({ error: 'Job not found' });
  res.json(await loadJob(req.params.id));
}));

// PATCH /admin/jobs/:id/status  { status }
router.patch('/jobs/:id/status', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Job not found' });
  const status = req.body?.status;
  if (!JOB_STATUSES.includes(status)) return res.status(400).json({ error: `status: ${JOB_STATUSES.join(', ')}` });
  const found = await db.transaction(async (c) => {
    const before = (await c.query('SELECT title, status FROM job_postings WHERE job_id = $1', [req.params.id])).rows[0];
    if (!before) return false;
    await c.query('UPDATE job_postings SET status = $2 WHERE job_id = $1', [req.params.id, status]);
    await audit(c, req, { actionType: 'job_status_changed', details: { jobId: req.params.id, title: before.title, status } });
    // tell everyone still waiting on this job that it is no longer open
    if (['filled', 'closed'].includes(status) && before.status !== status) {
      const waiting = (await c.query(
        `SELECT caregiver_id FROM job_matches WHERE job_id = $1 AND status IN ('interested', 'shortlisted')`,
        [req.params.id])).rows;
      for (const w of waiting) {
        await notify(c, w.caregiver_id, `job_${status}`,
          status === 'filled' ? `Position filled: ${before.title}` : `Job closed: ${before.title}`,
          status === 'filled' ? 'This position has been filled. Keep an eye on your matches for new jobs.'
            : 'This job is no longer open. Keep an eye on your matches for new jobs.',
          { jobId: req.params.id });
      }
    }
    return true;
  });
  if (!found) return res.status(404).json({ error: 'Job not found' });
  res.json(await loadJob(req.params.id));
}));

// PATCH /admin/jobs/:id/applicants/:caregiverId  { status: shortlisted | declined | interested }
router.patch('/jobs/:id/applicants/:caregiverId', wrap(async (req, res) => {
  const { id, caregiverId } = req.params;
  if (!isUuid(id) || !isUuid(caregiverId)) return res.status(404).json({ error: 'Applicant not found' });
  const status = req.body?.status;
  if (!APPLICANT_STATUSES.includes(status)) return res.status(400).json({ error: `status: ${APPLICANT_STATUSES.join(', ')}` });
  const result = await db.transaction(async (c) => {
    const row = (await c.query(
      `SELECT m.status, j.title FROM job_matches m JOIN job_postings j USING (job_id)
        WHERE m.job_id = $1 AND m.caregiver_id = $2 AND m.status IN ('interested', 'shortlisted', 'declined')`,
      [id, caregiverId])).rows[0];
    if (!row) return null;
    if (row.status === status) return row;
    await c.query('UPDATE job_matches SET status = $3 WHERE job_id = $1 AND caregiver_id = $2', [id, caregiverId, status]);
    await audit(c, req, { actionType: `applicant_${status}`,
      details: { jobId: id, caregiverId, title: row.title, previousStatus: row.status } });
    if (status === 'shortlisted') {
      await notify(c, caregiverId, 'applicant_shortlisted', `You have been shortlisted: ${row.title}`,
        'The family or agency will contact you about the next steps.', { jobId: id });
    } else if (status === 'declined') {
      await notify(c, caregiverId, 'applicant_declined', `Update on ${row.title}`,
        'You were not selected for this job this time. Your other matches are still open to you.', { jobId: id });
    }
    return row;
  });
  if (!result) return res.status(404).json({ error: 'This caregiver has not expressed interest in this job' });
  res.json(await loadJob(id));
}));

// ---------------------------------------------------------------- categories
router.get('/job-categories', wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.category_id, c.name, c.description, c.parent_category_id,
            (SELECT count(*) FROM job_postings j WHERE j.category_id = c.category_id)::int AS job_count
       FROM job_categories c ORDER BY c.name`);
  res.json({ categories: rows.map((c) => ({ categoryId: c.category_id, name: c.name, description: c.description,
    parentCategoryId: c.parent_category_id, jobCount: c.job_count })) });
}));

function validateCategory(b = {}) {
  const name = clean(b.name);
  const errors = {};
  if (name.length < 2 || name.length > 100) errors.name = '2-100 characters';
  if (b.parentCategoryId && !isUuid(b.parentCategoryId)) errors.parentCategoryId = 'invalid';
  return { name, description: clean(b.description) || null, parent: b.parentCategoryId || null, errors };
}

router.post('/job-categories', requireSuperAdmin, wrap(async (req, res) => {
  const v = validateCategory(req.body);
  if (Object.keys(v.errors).length) return res.status(400).json({ error: 'Validation failed', fields: v.errors });
  try {
    const { rows } = await db.query(
      `INSERT INTO job_categories (name, description, parent_category_id) VALUES ($1, $2, $3) RETURNING category_id`,
      [v.name, v.description, v.parent]);
    await audit(db, req, { actionType: 'category_created', details: { categoryId: rows[0].category_id, name: v.name } });
    res.status(201).json({ categoryId: rows[0].category_id, name: v.name, description: v.description, parentCategoryId: v.parent, jobCount: 0 });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A category with that name already exists' });
    throw err;
  }
}));

router.put('/job-categories/:id', requireSuperAdmin, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Category not found' });
  const v = validateCategory(req.body);
  if (Object.keys(v.errors).length) return res.status(400).json({ error: 'Validation failed', fields: v.errors });
  if (v.parent === req.params.id) return res.status(400).json({ error: 'A category cannot be its own parent' });
  try {
    const { rowCount } = await db.query(
      'UPDATE job_categories SET name = $2, description = $3, parent_category_id = $4 WHERE category_id = $1',
      [req.params.id, v.name, v.description, v.parent]);
    if (!rowCount) return res.status(404).json({ error: 'Category not found' });
    await audit(db, req, { actionType: 'category_updated', details: { categoryId: req.params.id, name: v.name } });
    res.json({ categoryId: req.params.id, name: v.name, description: v.description, parentCategoryId: v.parent });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A category with that name already exists' });
    throw err;
  }
}));

router.delete('/job-categories/:id', requireSuperAdmin, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Category not found' });
  const used = (await db.query('SELECT count(*)::int AS n FROM job_postings WHERE category_id = $1', [req.params.id])).rows[0].n;
  if (used) return res.status(409).json({ error: `${used} job(s) use this category. Move them first.`, reason: 'in_use' });
  const { rows } = await db.query('DELETE FROM job_categories WHERE category_id = $1 RETURNING name', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Category not found' });
  await audit(db, req, { actionType: 'category_deleted', details: { categoryId: req.params.id, name: rows[0].name } });
  res.status(204).end();
}));

module.exports = router;
