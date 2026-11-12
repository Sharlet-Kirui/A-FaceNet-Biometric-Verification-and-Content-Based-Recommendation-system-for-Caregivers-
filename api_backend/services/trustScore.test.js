// Run from api_backend:  node --test services/trustScore.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateTrust, faceScore, DEFAULTS } = require('./trustScore');

const good = {
  faceDetectedId: true, faceDetectedSelfie: true, blurId: 250, blurSelfie: 300,
  livenessPassed: true, faceDistance: 0.6, ocrScore: 0.92, iprsStatus: 'verified',
};

test('threshold distance maps to a face score of 0.5', () => {
  assert.equal(faceScore(DEFAULTS.face_distance_threshold, DEFAULTS.face_distance_threshold), 0.5);
});

test('clean genuine submission is approved', () => {
  const r = evaluateTrust(good);
  assert.equal(r.decision, 'approved');
  assert.deepEqual(r.failedGates, []);
  assert.ok(r.score >= DEFAULTS.trust_threshold);
});

test('stolen genuine ID (face mismatch, perfect documents) is never approved', () => {
  const r = evaluateTrust({ ...good, faceDistance: 1.15, ocrScore: 1 });
  assert.equal(r.decision, 'flagged');
  assert.ok(r.failedGates.includes('face_mismatch'));
});

test('IPRS mismatch is flagged', () => {
  const r = evaluateTrust({ ...good, iprsStatus: 'mismatch' });
  assert.equal(r.decision, 'flagged');
  assert.ok(r.failedGates.includes('iprs_mismatch'));
});

test('IPRS unavailable goes to review instead of guessing', () => {
  const r = evaluateTrust({ ...good, iprsStatus: 'unavailable' });
  assert.equal(r.decision, 'flagged');
  assert.ok(r.failedGates.includes('iprs_unavailable'));
});

test('failed liveness is flagged even with a strong score', () => {
  const r = evaluateTrust({ ...good, livenessPassed: false });
  assert.equal(r.decision, 'flagged');
  assert.ok(r.failedGates.includes('liveness_failed'));
});

test('blurry ID is flagged', () => {
  const r = evaluateTrust({ ...good, blurId: 40 });
  assert.ok(r.failedGates.includes('id_image_blurry'));
});

test('borderline face with weak OCR passes gates but falls below threshold', () => {
  const r = evaluateTrust({ ...good, faceDistance: 1.0, ocrScore: 0.6 });
  assert.deepEqual(r.failedGates, []);
  assert.equal(r.decision, 'flagged');
  assert.ok(r.reasons.includes('score_below_threshold'));
});

test('OCR not run yet: OCR left out and weights renormalised', () => {
  const r = evaluateTrust({ ...good, ocrScore: null });
  assert.equal(r.components.ocr, null);
  assert.ok(r.reasons.includes('ocr_not_run'));
  const expected = Math.round(((0.5 * r.components.face + 0.3 * 1) / 0.8) * 1000) / 1000;
  assert.equal(r.score, expected);
});

test('liveness not run is a failed gate while liveness is enforced', () => {
  const r = evaluateTrust({ ...good, livenessPassed: null });
  assert.ok(r.failedGates.includes('liveness_unavailable'));
  assert.equal(r.decision, 'flagged');
});

test('liveness not run is only noted when liveness_enforced = 0', () => {
  const r = evaluateTrust({ ...good, livenessPassed: null }, { ...DEFAULTS, liveness_enforced: 0 });
  assert.deepEqual(r.failedGates, []);
  assert.ok(r.reasons.includes('liveness_not_enforced'));
  assert.equal(r.decision, 'approved');
});

test('admin-changed weights are respected', () => {
  const r = evaluateTrust(good, { ...DEFAULTS, weight_face: 1, weight_ocr: 0, weight_iprs: 0 });
  assert.equal(r.score, r.components.face);
});

test('unreadable or different ID text adds ocr_low and lowers the score', () => {
  const clear = evaluateTrust({ ...good, ocrScore: 1 });
  const unclear = evaluateTrust({ ...good, ocrScore: 0.2 });
  assert.ok(unclear.reasons.includes('ocr_low'));
  assert.ok(!clear.reasons.includes('ocr_low'));
  assert.ok(unclear.score < clear.score);
  assert.deepEqual(unclear.failedGates, [], 'OCR is never a gate');
});
