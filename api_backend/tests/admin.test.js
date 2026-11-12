/**
 * /admin endpoint tests against your real database.
 *
 *   cd api_backend
 *   node --test tests/admin.test.js
 *
 * Creates two admins, caregivers with submissions and reports, a category, skills
 * and jobs (all marked zz-test) and deletes them at the end.
 */
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { signToken } = require('../middleware/auth');

const tag = crypto.randomBytes(3).toString('hex');
const PASSWORD = 'Admin!Pass1';
let api; let server; let db;
const made = { admins: [], caregivers: [], tags: [], jobs: [], categories: [] };
const tokens = {};

const q = async (text, params) => (await db.query(text, params)).rows;
const call = async (method, url, token, body) => {
  const r = await fetch(api + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};

/** A caregiver with a flagged submission, a report and a trust score, like the orchestrator writes. */
async function flaggedCaregiver() {
  const [c] = await q(
    `INSERT INTO caregivers (first_name, last_name, email, password_hash, county, experience_years, onboarding_status)
     VALUES ('Zz', 'Reviewee', $1, 'x', 'Nairobi', 3, 'under_review') RETURNING caregiver_id`,
    [`zz-test.${tag}.${made.caregivers.length}@example.com`]);
  made.caregivers.push(c.caregiver_id);
  const [s] = await q(
    `INSERT INTO kyc_submissions (caregiver_id, status, biometric_consent, iprs_consent)
     VALUES ($1, 'flagged', true, true) RETURNING submission_id`, [c.caregiver_id]);
  const [r] = await q(
    `INSERT INTO verification_reports (submission_id, facenet_distance, facenet_match_score, ocr_score, liveness_score,
       iprs_verification_status, overall_confidence, report_details)
     VALUES ($1, 1.18, 0.46, 1, 0.9, 'mismatch', 0.53, $2) RETURNING report_id`,
    [s.submission_id, JSON.stringify({ decision: 'flagged', failedGates: ['face_mismatch', 'iprs_mismatch'], reasons: ['face_mismatch'] })]);
  await q('INSERT INTO trust_scores (report_id, caregiver_id, score, is_verified) VALUES ($1, $2, 0.53, false)',
    [r.report_id, c.caregiver_id]);
  await q(`INSERT INTO kyc_documents (caregiver_id, submission_id, doc_type, storage_url, mime_type)
           VALUES ($1, $2, 'id_front', 'seed://x/id_front.jpg', 'image/jpeg')`, [c.caregiver_id, s.submission_id]);
  return { caregiverId: c.caregiver_id, submissionId: s.submission_id };
}

test.before(async () => {
  db = require('../db');
  const hash = await bcrypt.hash(PASSWORD, 8);
  for (const level of ['super_admin', 'reviewer']) {
    const [a] = await q(
      `INSERT INTO admins (first_name, last_name, email, password_hash, role_level)
       VALUES ('Zz', $1, $2, $3, $1) RETURNING admin_id`, [level, `zz-test.${tag}.${level}@caregiver.test`, hash]);
    made.admins.push(a.admin_id);
  }
  for (const s of ['wound', 'meds']) {
    const [t] = await q(`INSERT INTO skill_tags (skill_name, category) VALUES ($1, 'technical') RETURNING skill_tag_id`,
      [`zz-test ${tag} ${s}`]);
    made.tags.push(t.skill_tag_id);
  }
  const app = require('../app');
  server = app.listen(0);
  api = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await q(`DELETE FROM audit_logs WHERE admin_id = ANY($1) OR action_details->>'caregiverId' = ANY($2)`,
    [made.admins, made.caregivers]);
  await q('DELETE FROM caregivers WHERE caregiver_id = ANY($1)', [made.caregivers]);
  await q('DELETE FROM job_postings WHERE job_id = ANY($1)', [made.jobs]);
  await q('DELETE FROM job_categories WHERE category_id = ANY($1)', [made.categories]);
  await q('DELETE FROM skill_tags WHERE skill_tag_id = ANY($1)', [made.tags]);
  // settings changed by the test are put back before this point
  await q('DELETE FROM admins WHERE admin_id = ANY($1)', [made.admins]);
  await db.pool.end();
  server.close();
});

// ---------------------------------------------------------------- auth
test('login: wrong password 401, right password gives a token for each role', async () => {
  const email = `zz-test.${tag}.super_admin@caregiver.test`;
  assert.equal((await call('POST', '/admin/auth/login', null, { email, password: 'wrong' })).status, 401);
  for (const level of ['super_admin', 'reviewer']) {
    const r = await call('POST', '/admin/auth/login', null,
      { email: `zz-test.${tag}.${level}@caregiver.TEST`, password: PASSWORD });
    assert.equal(r.status, 200);
    assert.equal(r.body.admin.roleLevel, level);
    tokens[level] = r.body.token;
  }
  assert.equal((await call('GET', '/admin/auth/me', tokens.reviewer)).body.roleLevel, 'reviewer');
});

test('caregiver and admin tokens cannot be swapped', async () => {
  assert.equal((await call('GET', '/admin/submissions', signToken(crypto.randomUUID()))).status, 403);
  assert.equal((await call('GET', '/caregivers/me', tokens.reviewer)).status, 401);
  assert.equal((await call('GET', '/admin/submissions')).status, 401);
});

// ---------------------------------------------------------------- review
test('review queue, full report and approval update everything and are audited', async () => {
  const { caregiverId, submissionId } = await flaggedCaregiver();
  const list = await call('GET', '/admin/submissions?status=flagged&search=zz-test', tokens.reviewer);
  assert.equal(list.status, 200);
  const row = list.body.submissions.find((s) => s.submissionId === submissionId);
  assert.ok(row, 'flagged submission is in the queue');
  assert.deepEqual(row.failedGates, ['face_mismatch', 'iprs_mismatch']);

  const detail = await call('GET', `/admin/submissions/${submissionId}`, tokens.reviewer);
  assert.equal(detail.body.report.faceDistance, 1.18);
  assert.equal(detail.body.documents[0].hasFile, false);
  const doc = await call('GET', `/admin/documents/${detail.body.documents[0].documentId}`, tokens.reviewer);
  assert.equal(doc.status, 404, 'seeded record has no file');

  const ok = await call('POST', `/admin/submissions/${submissionId}/decision`, tokens.reviewer,
    { decision: 'approve', reason: 'Face checked by hand: older ID photo, same person' });
  assert.equal(ok.status, 200);
  const [c] = await q('SELECT onboarding_status FROM caregivers WHERE caregiver_id = $1', [caregiverId]);
  assert.equal(c.onboarding_status, 'verified');
  const [t] = await q('SELECT is_verified, valid_until FROM trust_scores WHERE caregiver_id = $1', [caregiverId]);
  assert.equal(t.is_verified, true);
  assert.ok(t.valid_until);
  const [r] = await q('SELECT status FROM verification_reports WHERE submission_id = $1', [submissionId]);
  assert.equal(r.status, 'reviewed');
  const history = (await call('GET', `/admin/submissions/${submissionId}`, tokens.reviewer)).body.history;
  assert.equal(history.at(-1).actionType, 'admin_approve');
  assert.equal(history.at(-1).details.automaticDecision, 'flagged');
});

test('rejection needs a reason and removes the badge', async () => {
  const { caregiverId, submissionId } = await flaggedCaregiver();
  const noReason = await call('POST', `/admin/submissions/${submissionId}/decision`, tokens.reviewer, { decision: 'reject' });
  assert.equal(noReason.status, 400);
  const r = await call('POST', `/admin/submissions/${submissionId}/decision`, tokens.reviewer,
    { decision: 'reject', reason: 'Selfie is a photo of a photo' });
  assert.equal(r.status, 200);
  const [c] = await q('SELECT onboarding_status FROM caregivers WHERE caregiver_id = $1', [caregiverId]);
  assert.equal(c.onboarding_status, 'rejected');
  assert.equal((await call('POST', `/admin/submissions/${crypto.randomUUID()}/decision`, tokens.reviewer,
    { decision: 'approve' })).status, 404);
});

// ---------------------------------------------------------------- categories and jobs
test('categories: reviewers cannot change them; in-use categories cannot be deleted', async () => {
  assert.equal((await call('POST', '/admin/job-categories', tokens.reviewer, { name: `zz-test ${tag}` })).status, 403);
  const created = await call('POST', '/admin/job-categories', tokens.super_admin, { name: `zz-test ${tag}` });
  assert.equal(created.status, 201);
  made.categories.push(created.body.categoryId);
  assert.equal((await call('POST', '/admin/job-categories', tokens.super_admin, { name: `zz-test ${tag}` })).status, 409);

  const job = await call('POST', '/admin/jobs', tokens.reviewer, {
    title: `zz-test ${tag} carer`, categoryId: created.body.categoryId, county: 'Nairobi', shift: 'morning',
    jobType: 'full_time', minExperienceYears: 2, salaryMinKes: 20000, salaryMaxKes: 30000, status: 'open',
    requirements: [{ skillTagId: made.tags[0], importance: 1 }, { skillTagId: made.tags[1], importance: 0.5 }],
  });
  assert.equal(job.status, 201, JSON.stringify(job.body));
  made.jobs.push(job.body.jobId);
  assert.equal(job.body.requirements.length, 2);

  const del = await call('DELETE', `/admin/job-categories/${created.body.categoryId}`, tokens.super_admin);
  assert.equal(del.status, 409);
});

test('jobs: validation, edit, status change and interested caregivers', async () => {
  const [cat] = await q('SELECT category_id FROM job_categories WHERE category_id = ANY($1)', [made.categories]);
  const bad = await call('POST', '/admin/jobs', tokens.reviewer,
    { title: 'x', categoryId: cat.category_id, county: '', salaryMinKes: 30000, salaryMaxKes: 20000, status: 'open' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.title && bad.body.fields.county && bad.body.fields.salaryMaxKes && bad.body.fields.requirements);

  const jobId = made.jobs[0];
  const edited = await call('PUT', `/admin/jobs/${jobId}`, tokens.reviewer, {
    title: `zz-test ${tag} carer (edited)`, categoryId: cat.category_id, county: 'Nairobi', shift: 'morning',
    jobType: 'part_time', minExperienceYears: 1, status: 'open',
    requirements: [{ skillTagId: made.tags[0], importance: 0.8, requiredProficiency: 2 }],
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.requirements.length, 1);
  assert.equal(edited.body.jobType, 'part_time');

  // a verified caregiver expresses interest through the caregiver API
  const [c] = await q(
    `INSERT INTO caregivers (first_name, last_name, email, password_hash, county, experience_years, onboarding_status)
     VALUES ('Zz', 'Interested', $1, 'x', 'Nairobi', 4, 'verified') RETURNING caregiver_id`, [`zz-test.${tag}.int@example.com`]);
  made.caregivers.push(c.caregiver_id);
  await q(`INSERT INTO caregiver_availability (caregiver_id, day_of_week, shift) VALUES ($1, 1, 'morning')`, [c.caregiver_id]);
  await q('INSERT INTO caregiver_skills (caregiver_id, skill_tag_id) VALUES ($1, $2)', [c.caregiver_id, made.tags[0]]);
  assert.equal((await call('POST', `/recommendations/${jobId}/interest`, signToken(c.caregiver_id))).status, 201);

  const detail = await call('GET', `/admin/jobs/${jobId}`, tokens.reviewer);
  assert.deepEqual(detail.body.interested.map((i) => i.caregiverId), [c.caregiver_id]);
  const list = await call('GET', `/admin/jobs?search=zz-test ${tag}`, tokens.reviewer);
  assert.equal(list.body.jobs[0].interestedCount, 1);

  const filled = await call('PATCH', `/admin/jobs/${jobId}/status`, tokens.reviewer, { status: 'filled' });
  assert.equal(filled.body.status, 'filled');
});

// ---------------------------------------------------------------- caregivers, settings, analytics, audit
test('caregiver search and profile', async () => {
  const list = await call('GET', `/admin/caregivers?search=zz-test.${tag}`, tokens.reviewer);
  assert.ok(list.body.total >= 2);
  const profile = await call('GET', `/admin/caregivers/${list.body.caregivers[0].caregiverId}`, tokens.reviewer);
  assert.equal(profile.status, 200);
  assert.ok(Array.isArray(profile.body.submissions));
});

test('settings: validated, weights must sum to 1, super admin only, audited, then restored', async () => {
  const before = (await call('GET', '/admin/settings', tokens.reviewer)).body.settings;
  const threshold = before.find((s) => s.key === 'trust_threshold').value;
  assert.equal((await call('PUT', '/admin/settings', tokens.reviewer, { settings: { trust_threshold: 0.8 } })).status, 403);
  assert.equal((await call('PUT', '/admin/settings', tokens.super_admin, { settings: { trust_threshold: 7 } })).status, 400);
  assert.equal((await call('PUT', '/admin/settings', tokens.super_admin, { settings: { weight_face: 0.9 } })).status, 400);
  const ok = await call('PUT', '/admin/settings', tokens.super_admin, { settings: { trust_threshold: 0.8 } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.updated.trust_threshold, { from: threshold, to: 0.8 });
  await call('PUT', '/admin/settings', tokens.super_admin, { settings: { trust_threshold: threshold } });
});

test('analytics and audit log', async () => {
  const a = await call('GET', '/admin/analytics', tokens.reviewer);
  assert.equal(a.status, 200);
  assert.equal(a.body.trustDistribution.length, 10);
  assert.ok(a.body.skills.some((s) => s.skill === `zz-test ${tag} wound`));
  const logs = await call('GET', '/admin/audit-logs?limit=20', tokens.reviewer);
  assert.ok(logs.body.logs.some((l) => l.actionType === 'settings_updated'));
  assert.ok(logs.body.actionTypes.includes('admin_approve'));
});
