/**
 * Privacy acceptance, email codes, password reset, compulsory details, profile editing,
 * required documents, application outcomes, notifications and match insights.
 *
 *   cd api_backend
 *   node --test tests/profile_and_applications.test.js
 *
 * Emails are not sent in tests (no SMTP settings): services/mailer.js keeps the last one.
 */
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mailer = require('../services/mailer');
const { signToken } = require('../middleware/auth');

const tag = crypto.randomBytes(3).toString('hex');
const PRIVACY = { acceptPrivacy: true, privacyVersion: '1.0' };
let api; let server; let db;
const made = { caregivers: [], tags: [], jobs: [], categories: [], admins: [] };

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
const email = (n) => `zz-test.${tag}.${n}@example.com`;
const goodDetails = (over = {}) => ({
  dateOfBirth: '1994-03-12', nationality: 'Kenyan', idType: 'National ID',
  idNumber: String(Math.floor(10000000 + Math.random() * 89999999)),
  address: { county: 'Nairobi', town: 'Kilimani' }, experienceYears: 3,
  policeClearance: { referenceNumber: 'PC-123', issuingAuthority: 'DCI', expiryDate: '2030-06-30' },
  workHistory: [{ employer: 'Sunrise Home', role: 'Caregiver', duties: 'Daily care', fromYear: 2022, toYear: null }],
  ...over,
});

async function register(n) {
  const r = await call('POST', '/auth/register', null,
    { fullName: 'Zz Tester', email: email(n), password: 'Str0ng!Pass', ...PRIVACY });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  made.caregivers.push(r.body.caregiverId);
  const v = await call('POST', '/auth/otp/verify', null, { email: email(n), code: r.body.devOtp });
  return { id: r.body.caregiverId, token: v.body.token };
}

test.before(async () => {
  db = require('../db');
  for (const s of ['wound', 'meds', 'night-care']) {
    const [t] = await q(`INSERT INTO skill_tags (skill_name, category) VALUES ($1, 'technical') RETURNING skill_tag_id`,
      [`zz-test ${tag} ${s}`]);
    made.tags.push(t.skill_tag_id);
  }
  const [cat] = await q('INSERT INTO job_categories (name) VALUES ($1) RETURNING category_id', [`zz-test ${tag}`]);
  made.categories.push(cat.category_id);
  const [a] = await q(`INSERT INTO admins (first_name, last_name, email, password_hash, role_level)
                       VALUES ('Zz', 'Admin', $1, $2, 'super_admin') RETURNING admin_id`,
  [`zz-test.${tag}@caregiver.test`, await bcrypt.hash('Admin!Pass1', 8)]);
  made.admins.push(a.admin_id);
  const app = require('../app');
  server = app.listen(0);
  api = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await q(`DELETE FROM audit_logs WHERE admin_id = ANY($1)`, [made.admins]);
  await q('DELETE FROM caregivers WHERE caregiver_id = ANY($1) OR email LIKE $2', [made.caregivers, `zz-test.${tag}.%`]);
  await q('DELETE FROM job_postings WHERE job_id = ANY($1)', [made.jobs]);
  await q('DELETE FROM job_categories WHERE category_id = ANY($1)', [made.categories]);
  await q('DELETE FROM skill_tags WHERE skill_tag_id = ANY($1)', [made.tags]);
  await q('DELETE FROM admins WHERE admin_id = ANY($1)', [made.admins]);
  await db.pool.end();
  server.close();
});

// ---------------------------------------------------------------- sign-up, email, password
test('registration requires accepting the current privacy notice, and records it', async () => {
  const base = { fullName: 'Zz Tester', email: email('p'), password: 'Str0ng!Pass' };
  assert.equal((await call('POST', '/auth/register', null, base)).status, 400);
  assert.equal((await call('POST', '/auth/register', null, { ...base, acceptPrivacy: true, privacyVersion: '0.9' })).status, 400);
  const r = await call('POST', '/auth/register', null, { ...base, ...PRIVACY });
  assert.equal(r.status, 201);
  made.caregivers.push(r.body.caregiverId);
  const [c] = await q('SELECT privacy_version, privacy_accepted_at FROM caregivers WHERE caregiver_id = $1', [r.body.caregiverId]);
  assert.equal(c.privacy_version, '1.0');
  assert.ok(c.privacy_accepted_at);
  assert.equal((await call('GET', '/auth/privacy')).body.version, '1.0');
});

test('the code is emailed, and a new one cannot be requested within 60 seconds', async () => {
  const r = await call('POST', '/auth/register', null, { fullName: 'Zz Mail', email: email('m'), password: 'Str0ng!Pass', ...PRIVACY });
  made.caregivers.push(r.body.caregiverId);
  const sent = mailer.lastMessage();
  assert.equal(sent.to, email('m'));
  assert.ok(sent.text.includes(r.body.devOtp), 'the email contains the code');
  const again = await call('POST', '/auth/otp/send', null, { email: email('m') });
  assert.equal(again.status, 429);
  assert.equal(again.body.reason, 'cooldown');
  assert.ok(again.body.retryAfter > 0 && again.body.retryAfter <= 60);
});

test('forgot password: emailed code resets the password; wrong code refused', async () => {
  await register('fp');
  const f = await call('POST', '/auth/password/forgot', null, { email: email('fp') });
  assert.equal(f.status, 200);
  assert.ok(mailer.lastMessage().subject.includes('reset'));
  assert.equal((await call('POST', '/auth/password/reset', null,
    { email: email('fp'), code: '000000', newPassword: 'N3w!Password' })).body.reason, 'wrong_code');
  const ok = await call('POST', '/auth/password/reset', null, { email: email('fp'), code: f.body.devOtp, newPassword: 'N3w!Password' });
  assert.equal(ok.status, 200);
  assert.equal((await call('POST', '/auth/login', null, { email: email('fp'), password: 'N3w!Password' })).status, 200);
  assert.equal((await call('POST', '/auth/login', null, { email: email('fp'), password: 'Str0ng!Pass' })).status, 401);
  // unknown email: same answer, nothing revealed
  assert.equal((await call('POST', '/auth/password/forgot', null, { email: email('nobody') })).status, 200);
});

// ---------------------------------------------------------------- details and profile editing
test('details: good conduct certificate is compulsory and must be valid; work history needed with experience', async () => {
  const { token } = await register('d');
  const missing = await call('PUT', '/caregivers/me/details', token, goodDetails({ policeClearance: {} }));
  assert.equal(missing.status, 400);
  assert.ok(missing.body.fields.policeClearance);
  const expired = await call('PUT', '/caregivers/me/details', token,
    goodDetails({ policeClearance: { referenceNumber: 'PC-1', expiryDate: '2020-01-01' } }));
  assert.match(expired.body.fields.policeClearance, /expired/);
  const noWork = await call('PUT', '/caregivers/me/details', token, goodDetails({ workHistory: [] }));
  assert.ok(noWork.body.fields.workHistory);
  const newcomer = await call('PUT', '/caregivers/me/details', token, goodDetails({ experienceYears: 0, workHistory: [] }));
  assert.equal(newcomer.status, 200, 'a newcomer with no experience needs no work history');
  const ten = await call('PUT', '/caregivers/me/details', token, goodDetails({ experienceYears: 12 }));
  assert.equal(ten.status, 200, 'real years, not capped at 5');
});

test('profile: GET /caregivers/me returns everything the edit screens need; identity locks after verification', async () => {
  const { id, token } = await register('e');
  const details = goodDetails();
  await call('PUT', '/caregivers/me/details', token, details);
  let me = (await call('GET', '/caregivers/me', token)).body;
  assert.equal(me.id_number, details.idNumber);
  assert.equal(me.credentials[0].reference_number, 'PC-123');
  assert.equal(me.work_history.length, 1);
  assert.equal(me.identity_locked, false);

  await q(`UPDATE caregivers SET onboarding_status = 'verified' WHERE caregiver_id = $1`, [id]);
  await q(`UPDATE caregiver_credentials SET status = 'verified' WHERE caregiver_id = $1`, [id]);
  me = (await call('GET', '/caregivers/me', token)).body;
  assert.equal(me.identity_locked, true);
  const changeId = await call('PUT', '/caregivers/me/details', token, { ...details, idNumber: '11112222' });
  assert.equal(changeId.status, 409);
  assert.equal(changeId.body.reason, 'identity_locked');
  const changeAddress = await call('PUT', '/caregivers/me/details', token,
    { ...details, address: { county: 'Kiambu', town: 'Thika' }, experienceYears: 4 });
  assert.equal(changeAddress.status, 200, 'address and experience stay editable');
  const [c] = await q(`SELECT onboarding_status, county FROM caregivers WHERE caregiver_id = $1`, [id]);
  assert.deepEqual([c.onboarding_status, c.county], ['verified', 'Kiambu']);
  const [cred] = await q(`SELECT status FROM caregiver_credentials WHERE caregiver_id = $1`, [id]);
  assert.equal(cred.status, 'verified', 'an unchanged certificate keeps its status');
});

// ---------------------------------------------------------------- required documents
test('documents: CV and good conduct are required before the selfie; the licence only for nursing licence holders', async () => {
  const { id, token } = await register('k');
  await call('PUT', '/caregivers/me/details', token, goodDetails());
  assert.deepEqual((await call('GET', '/kyc/requirements', token)).body.required, ['identity', 'good_conduct', 'cv']);
  const [nursing] = await q(`SELECT skill_tag_id FROM skill_tags WHERE lower(skill_name) = 'nursing council licence' LIMIT 1`);
  if (nursing) {
    await q('INSERT INTO caregiver_skills (caregiver_id, skill_tag_id) VALUES ($1, $2)', [id, nursing.skill_tag_id]);
    assert.ok((await call('GET', '/kyc/requirements', token)).body.required.includes('license'));
    await q('DELETE FROM caregiver_skills WHERE caregiver_id = $1', [id]);
  }
  const sub = (await call('POST', '/kyc/submissions', token, { biometricConsent: true, iprsConsent: true })).body;
  const fd = new FormData();
  for (const f of ['idFront', 'idBack']) fd.append(f, new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), `${f}.jpg`);
  const up = await fetch(`${api}/kyc/submissions/${sub.submission_id}/documents`, { method: 'POST', body: fd, headers: { Authorization: `Bearer ${token}` } });
  assert.deepEqual((await up.json()).missing, ['good_conduct', 'cv']);
  const blocked = await call('POST', `/kyc/submissions/${sub.submission_id}/liveness-challenge`, token);
  assert.equal(blocked.status, 400);
  assert.deepEqual(blocked.body.missing, ['good_conduct', 'cv']);
});

// ---------------------------------------------------------------- applications, notifications, insights
async function verifiedCaregiver(n, shifts = ['morning'], county = 'Nairobi') {
  const { id, token } = await register(n);
  await q(`UPDATE caregivers SET onboarding_status = 'verified', county = $2, experience_years = 3 WHERE caregiver_id = $1`, [id, county]);
  for (const s of shifts) await q('INSERT INTO caregiver_availability (caregiver_id, day_of_week, shift) VALUES ($1, 1, $2)', [id, s]);
  await q('INSERT INTO caregiver_skills (caregiver_id, skill_tag_id) VALUES ($1, $2)', [id, made.tags[0]]);
  return { id, token };
}
async function job(key, { shift = 'morning', minExp = 1, reqs = [0], county = 'Nairobi' } = {}) {
  const [j] = await q(
    `INSERT INTO job_postings (title, category_id, county, shift, min_experience_years, status)
     VALUES ($1, $2, $5, $3, $4, 'open') RETURNING job_id`, [`zz-test ${tag} ${key}`, made.categories[0], shift, minExp, county]);
  for (const i of reqs) await q('INSERT INTO job_skill_requirements (job_id, skill_tag_id) VALUES ($1, $2)', [j.job_id, made.tags[i]]);
  made.jobs.push(j.job_id);
  return j.job_id;
}

test('shortlist and decline: the caregiver sees the outcome and is notified; interest never downgrades it', async () => {
  const admin = (await call('POST', '/admin/auth/login', null, { email: `zz-test.${tag}@caregiver.test`, password: 'Admin!Pass1' })).body.token;
  const jobA = await job('A');
  const jobB = await job('B');
  const c = await verifiedCaregiver('s');
  assert.equal((await call('POST', `/recommendations/${jobA}/interest`, c.token)).status, 201);
  assert.equal((await call('POST', `/recommendations/${jobB}/interest`, c.token)).status, 201);

  const short = await call('PATCH', `/admin/jobs/${jobA}/applicants/${c.id}`, admin, { status: 'shortlisted' });
  assert.equal(short.status, 200);
  assert.equal(short.body.interested[0].status, 'shortlisted');
  assert.equal((await call('PATCH', `/admin/jobs/${jobB}/applicants/${c.id}`, admin, { status: 'declined' })).status, 200);
  assert.equal((await call('PATCH', `/admin/jobs/${jobB}/applicants/${crypto.randomUUID()}`, admin, { status: 'declined' })).status, 404);

  await call('POST', `/recommendations/${jobA}/interest`, c.token); // tapping again must not undo the shortlist
  const mine = (await call('GET', '/recommendations/interests', c.token)).body.interests;
  const statusOf = Object.fromEntries(mine.map((i) => [i.jobId, i.status]));
  assert.deepEqual([statusOf[jobA], statusOf[jobB]], ['shortlisted', 'declined']);

  const notes = (await call('GET', '/notifications', c.token)).body;
  assert.equal(notes.unread, 2);
  assert.deepEqual(notes.notifications.map((n) => n.type).sort(), ['applicant_declined', 'applicant_shortlisted']);
  assert.equal((await call('POST', '/notifications/read', c.token, {})).body.marked, 2);
  assert.equal((await call('GET', '/notifications', c.token)).body.unread, 0);

  // job filled: the shortlisted caregiver is told; the declined one is not told again
  await call('PATCH', `/admin/jobs/${jobA}/status`, admin, { status: 'filled' });
  const after = (await call('GET', '/notifications', c.token)).body;
  assert.equal(after.unread, 1);
  assert.equal(after.notifications[0].type, 'job_filled');
  const past = (await call('GET', '/recommendations/interests', c.token)).body.interests.find((i) => i.jobId === jobA);
  assert.equal(past.jobStatus, 'filled');
});

test('admin decisions notify the caregiver', async () => {
  const admin = (await call('POST', '/admin/auth/login', null, { email: `zz-test.${tag}@caregiver.test`, password: 'Admin!Pass1' })).body.token;
  const { id, token } = await register('r');
  const [s] = await q(`INSERT INTO kyc_submissions (caregiver_id, status) VALUES ($1, 'flagged') RETURNING submission_id`, [id]);
  const [r] = await q(`INSERT INTO verification_reports (submission_id, overall_confidence, report_details)
                       VALUES ($1, 0.5, '{"decision":"flagged"}') RETURNING report_id`, [s.submission_id]);
  await q('INSERT INTO trust_scores (report_id, caregiver_id, score) VALUES ($1, $2, 0.5)', [r.report_id, id]);
  await call('POST', `/admin/submissions/${s.submission_id}/decision`, admin, { decision: 'reject', reason: 'Selfie was a photo of a photo' });
  const n = (await call('GET', '/notifications', token)).body.notifications[0];
  assert.equal(n.type, 'verification_rejected');
  assert.match(n.body, /photo of a photo/);
});

test('insights: missing skills, other shifts and experience needed, for the caregiver\'s county', async () => {
  // a county of its own, so seeded jobs do not change the counts
  const county = `Zz ${tag}`;
  const c = await verifiedCaregiver('i', ['morning'], county);
  await job('needs-meds', { reqs: [0, 1], county });
  await job('needs-meds-2', { reqs: [1], county });
  await job('night', { shift: 'night', reqs: [2], county });
  await job('senior', { minExp: 15, reqs: [0], county });
  const r = await call('GET', '/recommendations/insights', c.token);
  assert.equal(r.status, 200);
  assert.equal(r.body.openJobsInCounty, 4);
  assert.deepEqual(r.body.skills, [{ skill: `zz-test ${tag} meds`, category: 'technical', jobs: 2 }]);
  assert.deepEqual(r.body.shifts, [{ shift: 'night', jobs: 1 }]);
  assert.equal(r.body.needMoreExperience, 1);
});

test('caregiver tokens still cannot use admin routes', async () => {
  assert.equal((await call('PATCH', `/admin/jobs/${crypto.randomUUID()}/applicants/${crypto.randomUUID()}`,
    signToken(crypto.randomUUID()), { status: 'shortlisted' })).status, 403);
});

test('account deletion: super admin only, needs a reason, removes the account and its uploads, audited', async () => {
  const fs = require('fs');
  const path = require('path');
  const admin = (await call('POST', '/admin/auth/login', null, { email: `zz-test.${tag}@caregiver.test`, password: 'Admin!Pass1' })).body.token;
  const { id } = await register('del');
  const root = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
  fs.mkdirSync(path.join(root, id, 'x'), { recursive: true });
  fs.writeFileSync(path.join(root, id, 'x', 'idFront.jpg'), 'x');
  assert.equal((await call('DELETE', `/admin/caregivers/${id}`, admin, {})).status, 400);
  assert.equal((await call('DELETE', `/admin/caregivers/${id}`, admin, { reason: 'Deletion requested by the caregiver' })).status, 204);
  assert.equal((await q('SELECT 1 FROM caregivers WHERE caregiver_id = $1', [id])).length, 0);
  assert.equal(fs.existsSync(path.join(root, id)), false, 'uploaded files removed');
  const [log] = await q(`SELECT action_details FROM audit_logs WHERE action_type = 'caregiver_deleted' AND action_details->>'caregiverId' = $1`, [id]);
  assert.equal(log.action_details.reason, 'Deletion requested by the caregiver');
});
