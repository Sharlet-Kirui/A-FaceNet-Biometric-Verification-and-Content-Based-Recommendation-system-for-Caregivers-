/**
 * End-to-end test of the onboarding + KYC flow against your real database,
 * with a FAKE ML service so it runs without DeepFace.
 *
 *   cd api_backend
 *   node --test tests/api.test.js
 *
 * Needs api_backend/.env (DATABASE_URL, JWT_SECRET, ID_ENC_KEY, ID_HMAC_KEY) and
 * migrations 1-8 applied. Test accounts are deleted at the end.
 */
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------------------------------------------------------------- fake ML service
let livenessMode = 'pass'; // 'pass' | 'missing' (404, endpoint not built)
let iprsMode = 'verified';
let faceDistance = 0.55;
const fakeMl = express();
fakeMl.post('/verify', (req, res) => res.json({
  face_detected: { id: true, selfie: true }, detection_confidence: { id: 0.99, selfie: 0.98 },
  blur_variance: { id: 240.5, selfie: 310.2 }, distance: faceDistance, match: faceDistance < 1.0644,
  face_score: 0.7, embeddings: { id_document: Array(128).fill(0.01), selfie: Array(128).fill(0.02) },
}));
fakeMl.post('/liveness', (req, res) => (livenessMode === 'missing'
  ? res.status(404).json({ detail: 'Not Found' })
  : res.json({ passed: true, liveness_score: 0.9, turn_ratio: 0.34 })));
let ocrMode = 'match'; // 'match' | 'low' | 'missing' (404) | 'no_tesseract'
fakeMl.post('/ocr', (req, res) => {
  if (ocrMode === 'missing') return res.status(404).json({ detail: 'Not Found' });
  if (ocrMode === 'no_tesseract') return res.json({ ran: false, reason: 'tesseract_not_installed' });
  const score = ocrMode === 'low' ? 0.1 : 1;
  res.json({ ran: true, ocr_score: score, id_number: { found: '*****456', score }, names: { found: [], score }, reason: null });
});
let lastIprsBody = null;
fakeMl.post('/iprs/lookup', express.json(), (req, res) => {
  lastIprsBody = req.body;
  res.json({ status: iprsMode === 'echo' ? 'verified' : iprsMode });
});

let api; let mlServer; let apiServer;
const PRIVACY = { acceptPrivacy: true, privacyVersion: '1.0' };
const created = [];
const tmpImg = path.join(os.tmpdir(), `kyc-test-${process.pid}.jpg`);

test.before(async () => {
  fs.writeFileSync(tmpImg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]));
  mlServer = fakeMl.listen(0);
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${mlServer.address().port}`;
  process.env.UPLOAD_DIR = path.join(os.tmpdir(), `kyc-uploads-${process.pid}`);
  const app = require('../app');
  apiServer = app.listen(0);
  api = `http://127.0.0.1:${apiServer.address().port}`;
});

test.after(async () => {
  const db = require('../db');
  if (created.length) {
    await db.query(`DELETE FROM audit_logs WHERE action_details->>'submissionId' IN (
      SELECT submission_id::text FROM kyc_submissions WHERE caregiver_id = ANY($1))`, [created]);
    await db.query('DELETE FROM caregivers WHERE caregiver_id = ANY($1)', [created]);
  }
  await db.pool.end();
  apiServer.close(); mlServer.close();
  fs.rmSync(tmpImg, { force: true });
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------- helpers
const json = (method, url, body, token) => fetch(api + url, {
  method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
  body: body && JSON.stringify(body),
});
function filesForm(fields, extra = {}) {
  const fd = new FormData();
  const data = fs.readFileSync(tmpImg);
  for (const f of fields) fd.append(f, new Blob([data], { type: 'image/jpeg' }), `${f}.jpg`);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}
const upload = (url, form, token) => fetch(api + url, { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });

async function onboard() {
  const email = `test.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  let r = await json('POST', '/auth/register', { fullName: 'Grace Wanjiku', email, password: 'Str0ng!Pass', ...PRIVACY });
  assert.equal(r.status, 201);
  const reg = await r.json();
  created.push(reg.caregiverId);
  assert.match(reg.devOtp, /^\d{6}$/);

  r = await json('POST', '/auth/otp/verify', { email, code: reg.devOtp });
  assert.equal(r.status, 200);
  const { token } = await r.json();

  r = await json('PUT', '/caregivers/me/details', {
    dateOfBirth: '1994-03-12', gender: 'Female', phone: '+254712345678', nationality: 'Kenyan',
    idType: 'National ID', idNumber: String(Math.floor(10000000 + Math.random() * 89999999)),
    address: { street: 'Ngong Rd', town: 'Kilimani', county: 'Nairobi', postalCode: '00100', country: 'Kenya' },
    experienceYears: 4,
    policeClearance: { referenceNumber: 'PC-123', issuingAuthority: 'DCI', expiryDate: '2027-06-30' },
    professionalLicense: { licenseNumber: '', issuingAuthority: '', expiryDate: null },
    workHistory: [{ employer: 'Sunrise Elderly Home', role: 'Caregiver', duties: 'Daily care', fromYear: 2021, toYear: null }],
  }, token);
  assert.equal(r.status, 200, await r.clone().text());

  r = await json('PUT', '/caregivers/me/specialties', {
    specializations: ['Dementia Care'], technicalSkills: ['Wound Dressing', 'Medication Management'],
    languages: ['English', 'Swahili'], availability: ['Day-shift'],
  }, token);
  assert.equal(r.status, 200);

  r = await json('POST', '/kyc/submissions', { biometricConsent: true, iprsConsent: true }, token);
  assert.equal(r.status, 201);
  const { submission_id: sid } = await r.json();

  r = await upload(`/kyc/submissions/${sid}/documents`, filesForm(['idFront', 'idBack', 'goodConduct', 'cv']), token);
  assert.equal(r.status, 200, await r.clone().text());
  const docs = await r.json();
  assert.equal(docs.idComplete, true);
  assert.ok(docs.documents.includes('cv'));
  return { email, token, sid };
}

async function challengeAndSelfie(token, sid) {
  let r = await json('POST', `/kyc/submissions/${sid}/liveness-challenge`, {}, token);
  const ch = await r.json();
  assert.match(ch.challenge, /^turn_(left|right)$/);
  r = await upload(`/kyc/submissions/${sid}/selfie`, filesForm(['selfie_center', 'selfie_turn', 'selfie_turn'], { nonce: ch.nonce }), token);
  return { r, nonce: ch.nonce };
}

// ---------------------------------------------------------------- tests
test('health endpoints', async () => {
  assert.equal((await fetch(api + '/health')).status, 200);
  const db = await (await fetch(api + '/health/db')).json();
  assert.equal(db.database, 'connected');
});

test('register rejects a weak password and a duplicate email', async () => {
  let r = await json('POST', '/auth/register', { fullName: 'A B', email: 'weak@example.com', password: 'weak', ...PRIVACY });
  assert.equal(r.status, 400);
  const { email } = await onboard();
  r = await json('POST', '/auth/register', { fullName: 'A B', email: email.toUpperCase(), password: 'Str0ng!Pass', ...PRIVACY });
  assert.equal(r.status, 409, 'lower(email) uniqueness');
});

test('login requires a verified email and the right password', async () => {
  const { email } = await onboard();
  assert.equal((await json('POST', '/auth/login', { email, password: 'wrong' })).status, 401);
  const r = await json('POST', '/auth/login', { email, password: 'Str0ng!Pass' });
  assert.equal(r.status, 200);
  assert.ok((await r.json()).token);
  assert.equal((await json('GET', '/caregivers/me')).status, 401, 'no token');
});

test('full flow: genuine caregiver is approved and everything is stored', async () => {
  livenessMode = 'pass'; iprsMode = 'verified'; faceDistance = 0.55;
  const { token, sid } = await onboard();
  const { r, nonce } = await challengeAndSelfie(token, sid);
  assert.equal(r.status, 200, await r.clone().text());
  const result = await r.json();
  assert.equal(result.decision, 'approved', JSON.stringify(result));
  assert.equal(result.components.ocr, 1, 'OCR score used in the trust score');
  assert.equal(result.ocr, 'run');

  // nonce is single-use
  const replay = await upload(`/kyc/submissions/${sid}/selfie`, filesForm(['selfie_center', 'selfie_turn'], { nonce }), token);
  assert.equal(replay.status, 400);

  const db = require('../db');
  const me = await (await json('GET', '/caregivers/me', null, token)).json();
  assert.equal(me.onboarding_status, 'verified');
  assert.equal(me.trust.is_verified, true);
  assert.ok(me.skills.some((s) => s.skill_name === "Dementia & Alzheimer's Care"), 'app label mapped to vocabulary');
  const emb = await db.query('SELECT count(*)::int n FROM face_embeddings WHERE submission_id = $1', [sid]);
  assert.equal(emb.rows[0].n, 2);
  const audit = await db.query(`SELECT count(*)::int n FROM audit_logs WHERE action_details->>'submissionId' = $1`, [sid]);
  assert.equal(audit.rows[0].n, 1);
  const status = await (await json('GET', `/kyc/submissions/${sid}`, null, token)).json();
  assert.equal(status.status, 'approved');
  const latest = await (await json('GET', '/kyc/submissions/latest', null, token)).json();
  assert.equal(latest.submission_id, sid, 'latest returns the newest submission');
  assert.equal(me.date_of_birth, '1994-03-12', 'date not shifted by timezone');

  // a later flagged attempt moves the caregiver back to under_review
  faceDistance = 1.3;
  const again = await (await challengeAndSelfie(token, sid)).r.json();
  assert.equal(again.decision, 'flagged');
  const me2 = await (await json('GET', '/caregivers/me', null, token)).json();
  assert.equal(me2.onboarding_status, 'under_review');
  assert.equal(me2.trust.is_verified, false);
  faceDistance = 0.55;
});

test('IPRS receives the exact date of birth even in Nairobi time (UTC+3)', async () => {
  livenessMode = 'pass'; iprsMode = 'echo'; faceDistance = 0.55;
  const { token, sid } = await onboard();
  await (await challengeAndSelfie(token, sid)).r.json();
  assert.equal(lastIprsBody.date_of_birth, '1994-03-12');
  assert.equal(lastIprsBody.first_name, 'Grace');
  assert.equal(lastIprsBody.last_name, 'Wanjiku');
  iprsMode = 'verified';
});

test('stolen ID (face mismatch) is flagged for review, not approved', async () => {
  livenessMode = 'pass'; iprsMode = 'verified'; faceDistance = 1.3;
  const { token, sid } = await onboard();
  const result = await (await challengeAndSelfie(token, sid)).r.json();
  assert.equal(result.decision, 'flagged');
  assert.ok(result.failedGates.includes('face_mismatch'));
});

test('liveness endpoint not built yet: flagged while liveness is enforced', async () => {
  livenessMode = 'missing'; iprsMode = 'verified'; faceDistance = 0.55;
  const { token, sid } = await onboard();
  const result = await (await challengeAndSelfie(token, sid)).r.json();
  assert.equal(result.decision, 'flagged');
  assert.ok(result.failedGates.includes('liveness_unavailable'));
});

test('IPRS mismatch is flagged', async () => {
  livenessMode = 'pass'; iprsMode = 'mismatch'; faceDistance = 0.55;
  const { token, sid } = await onboard();
  const result = await (await challengeAndSelfie(token, sid)).r.json();
  assert.ok(result.failedGates.includes('iprs_mismatch'));
});

test('a second account cannot reuse the same ID number', async () => {
  const a = await onboard();
  const b = await onboard();
  const idNumber = String(Math.floor(10000000 + Math.random() * 89999999));
  const payload = { dateOfBirth: '1994-03-12', nationality: 'Kenyan', idType: 'National ID', idNumber,
    address: { county: 'Nairobi' }, experienceYears: 0,
    policeClearance: { referenceNumber: 'PC-9', issuingAuthority: 'DCI', expiryDate: '2030-01-01' } };
  assert.equal((await json('PUT', '/caregivers/me/details', payload, a.token)).status, 200);
  const r = await json('PUT', '/caregivers/me/details', payload, b.token);
  assert.equal(r.status, 409, 'HMAC hash uniqueness');
});

test('OCR missing or without Tesseract is left out of the score, never blocking', async () => {
  livenessMode = 'pass'; iprsMode = 'verified'; faceDistance = 0.55;
  for (const mode of ['missing', 'no_tesseract']) {
    ocrMode = mode;
    const { token, sid } = await onboard();
    const result = await (await challengeAndSelfie(token, sid)).r.json();
    assert.equal(result.decision, 'approved', mode);
    assert.ok(result.reasons.includes('ocr_not_run'), mode);
  }
  ocrMode = 'match';
});

test('ID text that does not match the typed details lowers the score and asks for a clearer photo', async () => {
  livenessMode = 'pass'; iprsMode = 'verified'; faceDistance = 0.55; ocrMode = 'low';
  const { token, sid } = await onboard();
  const result = await (await challengeAndSelfie(token, sid)).r.json();
  assert.ok(result.reasons.includes('ocr_low'));
  assert.equal(result.decision, 'flagged', 'below the 0.75 threshold');
  assert.deepEqual(result.failedGates, []);
  const db = require('../db');
  const rep = await db.query('SELECT ocr_score, report_details FROM verification_reports WHERE submission_id = $1', [sid]);
  assert.equal(Number(rep.rows[0].ocr_score), 0.1);
  assert.equal(rep.rows[0].report_details.ocr.idNumber.found, '*****456', 'only the masked number is stored');
  ocrMode = 'match';
});

test('registry switched off: a registry mismatch no longer blocks, and the report says not checked', async () => {
  const db = require('../db');
  await db.query(`UPDATE system_settings SET value = 0 WHERE setting_key = 'iprs_enforced'`);
  try {
    livenessMode = 'pass'; iprsMode = 'mismatch'; faceDistance = 0.55; ocrMode = 'match';
    const { token, sid } = await onboard();
    const result = await (await challengeAndSelfie(token, sid)).r.json();
    assert.equal(result.decision, 'approved', JSON.stringify(result));
    assert.ok(result.reasons.includes('iprs_not_checked'));
    const rep = await db.query('SELECT iprs_verification_status FROM verification_reports WHERE submission_id = $1', [sid]);
    assert.equal(rep.rows[0].iprs_verification_status, 'not_checked');
    const notes = await (await json('GET', '/notifications', null, token)).json();
    assert.equal(notes.unread, 1);
    assert.equal(notes.notifications[0].type, 'verification_approved');
  } finally {
    await db.query(`UPDATE system_settings SET value = 1 WHERE setting_key = 'iprs_enforced'`);
    iprsMode = 'verified';
  }
});
