/**
 * Runs the verification pipeline for one KYC submission and records the result.
 *
 *   1. load settings (weights, thresholds) from system_settings
 *   2. FastAPI /verify       ID photo vs centre selfie
 *   3. FastAPI /liveness     centre + turn frames vs the issued challenge (skipped if not built yet)
 *   4. FastAPI /iprs/lookup  typed details vs the (mock) registry
 *   5. FastAPI /ocr          ID front text vs typed number and name (null if Tesseract is missing)
 *   6. trustScore.evaluateTrust -> approved | flagged
 *   7. write verification_reports, face_embeddings, trust_scores, audit_logs; update statuses
 */
const db = require('../db');
const ml = require('./mlClient');
const { loadSettings, evaluateTrust } = require('./trustScore');
const { decryptId } = require('./idCrypto');
const { notify, verificationMessage } = require('./notify');

let embeddingCast; // 'vector' or 'real[]', read once from the database
async function getEmbeddingCast(c) {
  if (embeddingCast) return embeddingCast;
  const { rows } = await c.query(
    `SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'face_embeddings' AND column_name = 'embedding'`);
  embeddingCast = rows[0]?.udt_name === 'vector' ? 'vector' : 'real[]';
  return embeddingCast;
}
const embeddingLiteral = (arr, cast) => (cast === 'vector' ? `[${arr.join(',')}]` : `{${arr.join(',')}}`);

async function runVerification(submissionId) {
  const settings = await loadSettings(db);

  const sub = (await db.query(
    `SELECT s.submission_id, s.caregiver_id, s.liveness_challenge,
            c.first_name, c.last_name, to_char(c.date_of_birth, 'YYYY-MM-DD') AS dob, c.id_type, c.id_number_encrypted
       FROM kyc_submissions s JOIN caregivers c USING (caregiver_id)
      WHERE s.submission_id = $1`, [submissionId])).rows[0];
  if (!sub) throw new Error('Submission not found');

  const docs = (await db.query(
    `SELECT doc_type, storage_url FROM kyc_documents WHERE submission_id = $1 ORDER BY created_at`,
    [submissionId])).rows;
  const one = (t) => docs.find((d) => d.doc_type === t)?.storage_url;
  const idPhoto = one('id_front') || one('passport');
  const centre = one('selfie_center');
  const turns = docs.filter((d) => d.doc_type === 'selfie_turn').map((d) => d.storage_url);
  if (!idPhoto || !centre) throw new Error('ID photo and centre selfie are required');

  await db.query(`UPDATE kyc_submissions SET status = 'processing' WHERE submission_id = $1`, [submissionId]);

  // --- ML calls
  const face = await ml.verifyFace(idPhoto, centre, settings.face_distance_threshold);
  if (face.notAvailable) throw new ml.MlServiceError('FastAPI /verify not found - add the verification router to main.py');

  let liveness = { status: 'not_run' };
  if (turns.length) {
    const lv = await ml.checkLiveness(centre, turns, sub.liveness_challenge, settings);
    liveness = lv.notAvailable ? { status: 'endpoint_not_built' } : { status: 'run', ...lv };
  }

  const dob = sub.dob; // formatted in SQL: a JS Date would shift the day in UTC+3
  let iprs = { status: 'unavailable', reason: 'missing_details' };
  if (!settings.iprs_enforced) {
    // registry switched off by an administrator: not consulted, recorded as not checked
    iprs = { status: 'not_checked', reason: 'iprs_not_enforced' };
  } else if (sub.id_number_encrypted && sub.id_type && dob) {
    const r = await ml.iprsLookup({ id_type: sub.id_type, id_number: decryptId(sub.id_number_encrypted),
      first_name: sub.first_name, last_name: sub.last_name, date_of_birth: dob });
    iprs = r.notAvailable ? { status: 'unavailable', reason: 'endpoint_not_built' } : r;
  }

  // OCR adds evidence but must never block a decision: if it is missing or fails,
  // it is left out of the score (weights renormalised) and the reason is recorded.
  let ocr = { status: 'not_run' };
  const idNumber = sub.id_number_encrypted ? decryptId(sub.id_number_encrypted) : null;
  if (idNumber) {
    try {
      const r = await ml.readId(idPhoto, { id_type: sub.id_type, id_number: idNumber,
        first_name: sub.first_name, last_name: sub.last_name });
      if (r.notAvailable) ocr = { status: 'endpoint_not_built' };
      else if (!r.ran) ocr = { status: r.reason || 'not_run' };
      else ocr = { status: 'run', ...r };
    } catch (err) {
      ocr = { status: 'error', error: err.message };
    }
  }

  const checks = {
    faceDetectedId: !!face.face_detected?.id,
    faceDetectedSelfie: !!face.face_detected?.selfie,
    blurId: face.blur_variance?.id,
    blurSelfie: face.blur_variance?.selfie,
    livenessPassed: liveness.status === 'run' ? !!liveness.passed : null,
    faceDistance: face.distance ?? Infinity,
    ocrScore: ocr.status === 'run' && Number.isFinite(ocr.ocr_score) ? ocr.ocr_score : null,
    iprsStatus: iprs.status,
  };
  const result = evaluateTrust(checks, settings);

  // --- persist
  await db.transaction(async (c) => {
    const rep = await c.query(
      `INSERT INTO verification_reports (submission_id, face_detection_score, facenet_distance, facenet_match_score,
          ocr_score, liveness_score, iprs_verification_status, overall_confidence, report_details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (submission_id) DO UPDATE SET face_detection_score = EXCLUDED.face_detection_score,
          facenet_distance = EXCLUDED.facenet_distance, facenet_match_score = EXCLUDED.facenet_match_score,
          ocr_score = EXCLUDED.ocr_score, liveness_score = EXCLUDED.liveness_score,
          iprs_verification_status = EXCLUDED.iprs_verification_status,
          overall_confidence = EXCLUDED.overall_confidence, report_details = EXCLUDED.report_details,
          generated_at = now()
       RETURNING report_id`,
      [submissionId,
        Math.min(face.detection_confidence?.id ?? 0, face.detection_confidence?.selfie ?? 0),
        Number.isFinite(face.distance) ? face.distance : null,
        result.components.face, result.components.ocr,
        liveness.status === 'run' && Number.isFinite(liveness.liveness_score) ? liveness.liveness_score : null,
        ['verified', 'mismatch', 'unavailable', 'not_checked'].includes(iprs.status) ? iprs.status : 'unavailable',
        result.score,
        JSON.stringify({
          decision: result.decision, failedGates: result.failedGates, reasons: result.reasons,
          components: result.components, weights: result.weights, threshold: result.threshold,
          faceThreshold: settings.face_distance_threshold, blur: face.blur_variance,
          liveness, iprs: { status: iprs.status, reason: iprs.reason, fields: iprs.fields },
          ocr: { status: ocr.status, score: ocr.ocr_score, idNumber: ocr.id_number, names: ocr.names,
            reason: ocr.reason, error: ocr.error },
          challenge: sub.liveness_challenge,
        })]);
    const reportId = rep.rows[0].report_id;

    const cast = await getEmbeddingCast(c);
    for (const [source, emb] of Object.entries(face.embeddings || {})) {
      if (!Array.isArray(emb) || emb.length !== 128) continue;
      await c.query(
        `INSERT INTO face_embeddings (submission_id, source, embedding) VALUES ($1, $2, $3::${cast})
         ON CONFLICT (submission_id, source) DO UPDATE SET embedding = EXCLUDED.embedding, created_at = now()`,
        [submissionId, source, embeddingLiteral(emb, cast)]);
    }

    const trust = await c.query(
      `INSERT INTO trust_scores (report_id, caregiver_id, score, is_verified, badge_issued_at, valid_until)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() END, CASE WHEN $4 THEN now() + interval '1 year' END)
       ON CONFLICT (caregiver_id) DO UPDATE SET report_id = EXCLUDED.report_id, score = EXCLUDED.score,
          is_verified = EXCLUDED.is_verified, badge_issued_at = EXCLUDED.badge_issued_at,
          valid_until = EXCLUDED.valid_until, created_at = now()
       RETURNING trust_score_id`,
      [reportId, sub.caregiver_id, result.score, result.isVerified]);

    await c.query(
      `INSERT INTO audit_logs (trust_score_id, action_type, rule_applied, action_details)
       VALUES ($1, 'auto_trust_decision', 'gates+weighted_score', $2)`,
      [trust.rows[0].trust_score_id, JSON.stringify({ submissionId, decision: result.decision,
        score: result.score, reasons: result.reasons })]);

    await c.query('UPDATE kyc_submissions SET status = $2 WHERE submission_id = $1',
      [submissionId, result.decision === 'approved' ? 'approved' : 'flagged']);
    // The latest verification result decides the status, so it can move back from verified to under_review
    await c.query('UPDATE caregivers SET onboarding_status = $2 WHERE caregiver_id = $1',
      [sub.caregiver_id, result.decision === 'approved' ? 'verified' : 'under_review']);
    const [type, title, body] = verificationMessage(result.decision === 'approved');
    await notify(c, sub.caregiver_id, type, title, body, { submissionId });
  });

  return { submissionId, ...result, liveness: liveness.status, iprs: iprs.status, ocr: ocr.status };
}

module.exports = { runVerification };
