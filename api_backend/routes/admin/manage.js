// Caregivers, system settings, analytics, audit log and the skill vocabulary.
const express = require('express');
const db = require('../../db');
const { requireSuperAdmin } = require('../../middleware/adminAuth');
const { wrap, isUuid, page, audit } = require('./util');

const router = express.Router();
const num = (v) => (v == null ? null : Number(v));

// ---------------------------------------------------------------- caregivers
// GET /admin/caregivers?search=&status=&county=&limit=&offset=
router.get('/caregivers', wrap(async (req, res) => {
  const { limit, offset } = page(req.query);
  const params = [];
  const where = [];
  const search = String(req.query.search || '').trim().toLowerCase();
  if (search) {
    params.push(`%${search}%`);
    where.push(`(lower(c.first_name || ' ' || c.last_name) LIKE $${params.length} OR lower(c.email) LIKE $${params.length})`);
  }
  if (req.query.status) { params.push(req.query.status); where.push(`c.onboarding_status = $${params.length}`); }
  if (req.query.county) { params.push(req.query.county); where.push(`c.county = $${params.length}`); }
  const { rows } = await db.query(
    `SELECT c.caregiver_id, c.first_name, c.last_name, c.email, c.county, c.experience_years,
            c.onboarding_status, c.created_at, t.score AS trust_score, t.is_verified,
            (SELECT count(*) FROM caregiver_skills s WHERE s.caregiver_id = c.caregiver_id)::int AS skill_count,
            count(*) OVER () AS total
       FROM caregivers c LEFT JOIN trust_scores t USING (caregiver_id)
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  res.json({
    total: Number(rows[0]?.total || 0),
    caregivers: rows.map((c) => ({
      caregiverId: c.caregiver_id, name: `${c.first_name} ${c.last_name}`, email: c.email, county: c.county,
      experienceYears: c.experience_years, onboardingStatus: c.onboarding_status, createdAt: c.created_at,
      trustScore: num(c.trust_score), isVerified: c.is_verified === true, skillCount: c.skill_count,
    })),
  });
}));

router.get('/caregivers/:id', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Caregiver not found' });
  const c = (await db.query(
    `SELECT caregiver_id, first_name, last_name, email, phone, to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
            gender, nationality, id_type, street, town, county, experience_years, onboarding_status, created_at
       FROM caregivers WHERE caregiver_id = $1`, [req.params.id])).rows[0];
  if (!c) return res.status(404).json({ error: 'Caregiver not found' });
  const id = c.caregiver_id;
  const [skills, availability, credentials, work, submissions, trust, interests] = await Promise.all([
    db.query(`SELECT t.skill_name, t.category, s.proficiency_level FROM caregiver_skills s JOIN skill_tags t USING (skill_tag_id)
               WHERE s.caregiver_id = $1 ORDER BY t.category, t.skill_name`, [id]),
    db.query('SELECT DISTINCT shift FROM caregiver_availability WHERE caregiver_id = $1 ORDER BY shift', [id]),
    db.query(`SELECT credential_type, reference_number, issuing_authority, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date, status
                FROM caregiver_credentials WHERE caregiver_id = $1`, [id]),
    db.query('SELECT employer, role, duties, from_year, to_year FROM work_history WHERE caregiver_id = $1 ORDER BY from_year DESC', [id]),
    db.query(`SELECT s.submission_id, s.attempt_number, s.status, s.submitted_at, r.overall_confidence
                FROM kyc_submissions s LEFT JOIN verification_reports r USING (submission_id)
               WHERE s.caregiver_id = $1 ORDER BY s.attempt_number DESC`, [id]),
    db.query('SELECT score, is_verified, badge_issued_at, valid_until FROM trust_scores WHERE caregiver_id = $1', [id]),
    db.query(`SELECT m.job_id, j.title, j.status, m.match_score, m.matched_at FROM job_matches m JOIN job_postings j USING (job_id)
               WHERE m.caregiver_id = $1 AND m.status = 'interested' ORDER BY m.matched_at DESC`, [id]),
  ]);
  const t = trust.rows[0];
  res.json({
    caregiverId: id, firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone,
    dateOfBirth: c.date_of_birth, gender: c.gender, nationality: c.nationality, idType: c.id_type,
    street: c.street, town: c.town, county: c.county, experienceYears: c.experience_years,
    onboardingStatus: c.onboarding_status, createdAt: c.created_at,
    trust: t ? { score: num(t.score), isVerified: t.is_verified, badgeIssuedAt: t.badge_issued_at, validUntil: t.valid_until } : null,
    skills: skills.rows.map((s) => ({ name: s.skill_name, category: s.category, proficiency: s.proficiency_level })),
    shifts: availability.rows.map((a) => a.shift),
    credentials: credentials.rows,
    workHistory: work.rows,
    submissions: submissions.rows.map((s) => ({ submissionId: s.submission_id, attemptNumber: s.attempt_number,
      status: s.status, submittedAt: s.submitted_at, trustScore: num(s.overall_confidence) })),
    interests: interests.rows.map((i) => ({ jobId: i.job_id, title: i.title, jobStatus: i.status,
      matchScore: num(i.match_score), interestedAt: i.matched_at })),
  });
}));

// ---------------------------------------------------------------- skill vocabulary (job form)
router.get('/skill-tags', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT skill_tag_id, skill_name, category FROM skill_tags ORDER BY category, skill_name');
  res.json({ skillTags: rows.map((t) => ({ skillTagId: t.skill_tag_id, name: t.skill_name, category: t.category })) });
}));

// ---------------------------------------------------------------- settings
// Allowed range per key; anything else in system_settings is shown read-only.
const SETTING_RANGES = {
  weight_face: [0, 1], weight_ocr: [0, 1], weight_iprs: [0, 1],
  trust_threshold: [0, 1], face_distance_threshold: [0.1, 2], blur_threshold: [0, 1000],
  liveness_min_turn_ratio: [0.05, 1.5], liveness_same_person_threshold: [0.1, 2],
  liveness_nonce_ttl_seconds: [30, 600], liveness_enforced: [0, 1],
};

router.get('/settings', wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.setting_key, s.value, s.description, s.updated_at, a.first_name || ' ' || a.last_name AS updated_by
       FROM system_settings s LEFT JOIN admins a ON a.admin_id = s.updated_by ORDER BY s.setting_key`);
  res.json({ settings: rows.map((r) => ({ key: r.setting_key, value: Number(r.value), description: r.description,
    updatedAt: r.updated_at, updatedBy: r.updated_by, range: SETTING_RANGES[r.setting_key] || null,
    editable: Boolean(SETTING_RANGES[r.setting_key]) })) });
}));

// PUT /admin/settings  { settings: { key: value, ... } }  (super_admin)
router.put('/settings', requireSuperAdmin, wrap(async (req, res) => {
  const changes = req.body?.settings;
  if (!changes || typeof changes !== 'object') return res.status(400).json({ error: 'Send { settings: { key: value } }' });
  const errors = {};
  for (const [k, v] of Object.entries(changes)) {
    const range = SETTING_RANGES[k];
    const n = Number(v);
    if (!range) errors[k] = 'not editable';
    else if (!Number.isFinite(n) || n < range[0] || n > range[1]) errors[k] = `between ${range[0]} and ${range[1]}`;
    else if (k === 'liveness_enforced' && ![0, 1].includes(n)) errors[k] = '0 or 1';
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Validation failed', fields: errors });

  const result = await db.transaction(async (c) => {
    const current = Object.fromEntries((await c.query('SELECT setting_key, value FROM system_settings')).rows
      .map((r) => [r.setting_key, Number(r.value)]));
    const next = { ...current, ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, Number(v)])) };
    const weightSum = next.weight_face + next.weight_ocr + next.weight_iprs;
    if (Math.abs(weightSum - 1) > 0.001) {
      return { status: 400, body: { error: `The three weights must add up to 1 (now ${weightSum.toFixed(2)})`,
        fields: { weight_face: 'sum', weight_ocr: 'sum', weight_iprs: 'sum' } } };
    }
    const changed = {};
    for (const [k, v] of Object.entries(changes)) {
      if (current[k] === Number(v)) continue;
      await c.query('UPDATE system_settings SET value = $2, updated_by = $3, updated_at = now() WHERE setting_key = $1',
        [k, Number(v), req.adminId]);
      changed[k] = { from: current[k], to: Number(v) };
    }
    if (Object.keys(changed).length) await audit(c, req, { actionType: 'settings_updated', details: { changed } });
    return { status: 200, body: { updated: changed } };
  });
  res.status(result.status).json(result.body);
}));

// ---------------------------------------------------------------- analytics
router.get('/analytics', wrap(async (req, res) => {
  const [funnel, submissions, decisions, trustBins, skills, totals] = await Promise.all([
    db.query('SELECT onboarding_status AS status, count(*)::int AS n FROM caregivers GROUP BY onboarding_status'),
    db.query('SELECT status, count(*)::int AS n FROM kyc_submissions GROUP BY status'),
    db.query(`SELECT action_type, count(*)::int AS n FROM audit_logs
               WHERE action_type IN ('auto_trust_decision', 'admin_approve', 'admin_reject') GROUP BY action_type`),
    // 10 bins of 0.1 over the trust score
    db.query(`SELECT LEAST(width_bucket(score, 0, 1, 10), 10) AS bin, count(*)::int AS n,
                     count(*) FILTER (WHERE is_verified)::int AS verified
                FROM trust_scores GROUP BY 1 ORDER BY 1`),
    // demand = open jobs requiring the skill; supply = verified caregivers who have it
    db.query(`SELECT t.skill_name, t.category,
                     (SELECT count(*) FROM job_skill_requirements r JOIN job_postings j USING (job_id)
                       WHERE r.skill_tag_id = t.skill_tag_id AND j.status = 'open')::int AS demand,
                     (SELECT count(*) FROM caregiver_skills s JOIN caregivers c USING (caregiver_id)
                       WHERE s.skill_tag_id = t.skill_tag_id AND c.onboarding_status = 'verified')::int AS supply
                FROM skill_tags t`),
    db.query(`SELECT (SELECT count(*) FROM caregivers)::int AS caregivers,
                     (SELECT count(*) FROM caregivers WHERE onboarding_status = 'verified')::int AS verified,
                     (SELECT count(*) FROM kyc_submissions WHERE status = 'flagged')::int AS awaiting_review,
                     (SELECT count(*) FROM job_postings WHERE status = 'open')::int AS open_jobs,
                     (SELECT count(*) FROM job_matches WHERE status = 'interested')::int AS interests,
                     (SELECT avg(score) FROM trust_scores WHERE is_verified) AS avg_verified_trust`),
  ]);
  const bins = Array.from({ length: 10 }, (_, i) => ({ range: `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}`, count: 0, verified: 0 }));
  for (const b of trustBins.rows) {
    const i = Math.max(1, Math.min(10, Number(b.bin))) - 1;
    bins[i].count += b.n;
    bins[i].verified += b.verified;
  }
  const t = totals.rows[0];
  const skillRows = skills.rows
    .filter((s) => s.demand > 0 || s.supply > 0)
    .map((s) => ({ skill: s.skill_name, category: s.category, demand: s.demand, supply: s.supply,
      // open jobs per verified caregiver with the skill: higher = scarcer
      pressure: s.supply ? Number((s.demand / s.supply).toFixed(2)) : null }))
    .sort((a, b) => b.demand - a.demand || a.supply - b.supply);
  res.json({
    totals: { caregivers: t.caregivers, verified: t.verified, awaitingReview: t.awaiting_review,
      openJobs: t.open_jobs, interests: t.interests, avgVerifiedTrust: num(t.avg_verified_trust) },
    funnel: funnel.rows.map((r) => ({ status: r.status, count: r.n })),
    submissions: Object.fromEntries(submissions.rows.map((r) => [r.status, r.n])),
    decisions: Object.fromEntries(decisions.rows.map((r) => [r.action_type, r.n])),
    trustDistribution: bins,
    skills: skillRows,
  });
}));

// ---------------------------------------------------------------- audit log
// GET /admin/audit-logs?actionType=&limit=&offset=
router.get('/audit-logs', wrap(async (req, res) => {
  const { limit, offset } = page(req.query);
  const params = [];
  let where = '';
  if (req.query.actionType) { params.push(req.query.actionType); where = 'WHERE l.action_type = $1'; }
  const { rows } = await db.query(
    `SELECT l.log_id, l.action_type, l.rule_applied, l.action_details, host(l.ip_address) AS ip, l.created_at,
            a.first_name || ' ' || a.last_name AS admin_name, count(*) OVER () AS total
       FROM audit_logs l LEFT JOIN admins a USING (admin_id) ${where}
      ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  const types = await db.query('SELECT DISTINCT action_type FROM audit_logs ORDER BY 1');
  res.json({
    total: Number(rows[0]?.total || 0),
    actionTypes: types.rows.map((r) => r.action_type),
    logs: rows.map((l) => ({ logId: l.log_id, actionType: l.action_type, rule: l.rule_applied,
      details: l.action_details, ip: l.ip, at: l.created_at, adminName: l.admin_name || 'System' })),
  });
}));

module.exports = router;
