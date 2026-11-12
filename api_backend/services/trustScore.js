/**
 * Trust decision: gates + weighted score + threshold.
 *
 *   Gates (any failure => 'flagged' for admin review, never auto-approved):
 *     - a face is detected on both the ID photo and the selfie
 *     - both images pass the blur check (Laplacian variance)
 *     - liveness passed
 *     - face distance is below the FaceNet threshold (stops a stolen but genuine ID)
 *     - IPRS is not a mismatch, and is available (only while iprs_enforced = 1; when 0 the
 *       registry is not consulted, left out of the score and noted as iprs_not_checked)
 *
 *   Score (0-1) = w_face * face + w_ocr * ocr + w_iprs * iprs
 *     face = clamp(1 - d / (2 * tau), 0, 1)   -> the threshold tau maps to 0.5
 *     ocr  = 0-1 agreement between OCR output and typed details (from FastAPI)
 *     iprs = 1 verified, 0 otherwise
 *
 *   Decision: no failed gates AND score >= trust_threshold => 'approved', else 'flagged'.
 *   Admins make the final reject decision on flagged submissions.
 *
 * Weights and thresholds come from the system_settings table; DEFAULTS are used
 * for any key that is missing.
 */

const OCR_LOW = 0.5; // below this the ID text barely agrees with the typed details

const DEFAULTS = Object.freeze({
  weight_face: 0.5,
  weight_ocr: 0.2,
  weight_iprs: 0.3,
  trust_threshold: 0.75,
  face_distance_threshold: 1.0958, // EER on LFW (migration 8)
  blur_threshold: 100,
  liveness_min_turn_ratio: 0.25,
  liveness_same_person_threshold: 1.25,
  liveness_nonce_ttl_seconds: 120,
  liveness_enforced: 1,
  iprs_enforced: 1,
});

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const round3 = (x) => Math.round(x * 1000) / 1000;

/** Reads system_settings via any client with .query (pg Client or Pool). */
async function loadSettings(db) {
  const { rows } = await db.query('SELECT setting_key, value FROM system_settings');
  const settings = { ...DEFAULTS };
  for (const r of rows) settings[r.setting_key] = Number(r.value);
  return settings;
}

function faceScore(distance, tau) {
  if (distance == null || !Number.isFinite(distance)) return 0;
  return clamp01(1 - distance / (2 * tau));
}

function iprsScore(status) {
  return status === 'verified' ? 1 : 0;
}

/**
 * @param {object} checks
 *   faceDetectedId, faceDetectedSelfie   boolean
 *   blurId, blurSelfie                   number  (Laplacian variance)
 *   livenessPassed                       boolean | null (null = check not run)
 *   faceDistance                         number  (FaceNet euclidean_l2)
 *   ocrScore                             number 0-1 | null (null = OCR not run yet;
 *                                        OCR is then left out and the weights renormalised)
 *   iprsStatus                           'verified' | 'mismatch' | 'unavailable' | 'not_checked'
 * @param {object} settings  from loadSettings() or DEFAULTS
 */
function evaluateTrust(checks, settings = DEFAULTS) {
  const s = { ...DEFAULTS, ...settings };
  const failedGates = [];

  if (!checks.faceDetectedId) failedGates.push('no_face_on_id');
  if (!checks.faceDetectedSelfie) failedGates.push('no_face_on_selfie');
  if (!(checks.blurId >= s.blur_threshold)) failedGates.push('id_image_blurry');
  if (!(checks.blurSelfie >= s.blur_threshold)) failedGates.push('selfie_blurry');
  const notes = [];
  if (checks.livenessPassed === true) {
    // passed
  } else if (checks.livenessPassed == null && !s.liveness_enforced) {
    notes.push('liveness_not_enforced');
  } else if (checks.livenessPassed == null) {
    failedGates.push('liveness_unavailable');
  } else {
    failedGates.push('liveness_failed');
  }
  if (!(checks.faceDistance < s.face_distance_threshold)) failedGates.push('face_mismatch');
  const iprsUsed = Boolean(s.iprs_enforced);
  if (!iprsUsed) notes.push('iprs_not_checked');
  else if (checks.iprsStatus === 'mismatch') failedGates.push('iprs_mismatch');
  else if (checks.iprsStatus !== 'verified') failedGates.push('iprs_unavailable');

  const components = {
    face: round3(faceScore(checks.faceDistance, s.face_distance_threshold)),
    ocr: checks.ocrScore == null ? null : round3(clamp01(checks.ocrScore)),
    iprs: iprsUsed ? iprsScore(checks.iprsStatus) : null,
  };

  const wOcr = components.ocr == null ? 0 : s.weight_ocr;
  if (components.ocr == null) notes.push('ocr_not_run');
  // Not a gate: tells the caregiver to upload a clearer ID photo when the
  // number or name could not be read (the score itself already reflects it)
  else if (components.ocr < OCR_LOW) notes.push('ocr_low');
  const wIprs = components.iprs == null ? 0 : s.weight_iprs;
  const wSum = s.weight_face + wOcr + wIprs;
  if (!(wSum > 0)) throw new Error('Trust weights must sum to more than 0');
  const score = round3(
    (s.weight_face * components.face + wOcr * (components.ocr ?? 0) + wIprs * (components.iprs ?? 0)) / wSum
  );

  const approved = failedGates.length === 0 && score >= s.trust_threshold;
  const reasons = [...failedGates, ...notes];
  if (failedGates.length === 0 && !approved) reasons.push('score_below_threshold');

  return {
    score,
    decision: approved ? 'approved' : 'flagged',
    isVerified: approved,
    failedGates,
    reasons,
    components,
    weights: { face: s.weight_face, ocr: s.weight_ocr, iprs: s.weight_iprs },
    threshold: s.trust_threshold,
  };
}

module.exports = { DEFAULTS, loadSettings, faceScore, iprsScore, evaluateTrust };
