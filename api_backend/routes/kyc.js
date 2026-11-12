// /kyc: submissions, document uploads, liveness challenge, selfie frames + verification.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { loadSettings } = require('../services/trustScore');
const { runVerification } = require('../services/kycOrchestrator');
const { MlServiceError } = require('../services/mlClient');
const { advanceStatus } = require('../services/onboarding');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));

// App field name (kyc_screen.dart keys) -> kyc_documents.doc_type
const DOC_FIELDS = {
  idFront: 'id_front', idBack: 'id_back', passport: 'passport', goodConduct: 'good_conduct',
  tvetCdacc: 'tvet_cdacc', license: 'license', cv: 'cv', other: 'other',
};
const ALLOWED = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const IMAGE_ONLY = new Set(['id_front', 'id_back', 'passport']);

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(UPLOAD_ROOT, req.caregiverId, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `${file.fieldname}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 12 },
  fileFilter(req, file, cb) {
    // Some phones send images as application/octet-stream; accept by extension too
    const extOk = /\.(jpe?g|png|pdf)$/i.test(file.originalname || '');
    cb(null, ALLOWED.has(file.mimetype) || extOk);
  },
});

async function ownSubmission(caregiverId, submissionId) {
  const { rows } = await db.query(
    'SELECT * FROM kyc_submissions WHERE submission_id = $1 AND caregiver_id = $2', [submissionId, caregiverId]);
  return rows[0];
}
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s || '');

async function saveDocs(caregiverId, submissionId, files, mapType) {
  for (const f of files) {
    const docType = mapType(f.fieldname);
    if (!docType) continue;
    await db.query(
      `INSERT INTO kyc_documents (caregiver_id, submission_id, doc_type, storage_url, mime_type, size_bytes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [caregiverId, submissionId, docType, f.path, f.mimetype, f.size]);
  }
}

// POST /kyc/submissions  { biometricConsent: true, iprsConsent: true }
router.post('/submissions', requireAuth, wrap(async (req, res) => {
  const { biometricConsent, iprsConsent } = req.body || {};
  if (biometricConsent !== true || iprsConsent !== true) {
    return res.status(400).json({ error: 'Biometric and IPRS consent are both required (Data Protection Act 2019)' });
  }
  const { rows } = await db.query(
    `INSERT INTO kyc_submissions (caregiver_id, attempt_number, biometric_consent, iprs_consent)
     VALUES ($1, COALESCE((SELECT max(attempt_number) FROM kyc_submissions WHERE caregiver_id = $1), 0) + 1, true, true)
     RETURNING submission_id, attempt_number, status`, [req.caregiverId]);
  await db.query(
    'UPDATE caregivers SET biometric_consent_at = now(), iprs_consent_at = now() WHERE caregiver_id = $1',
    [req.caregiverId]);
  res.status(201).json(rows[0]);
}));

// POST /kyc/submissions/:id/documents  multipart fields: idFront, idBack | passport, goodConduct, tvetCdacc, license, cv, other
router.post('/submissions/:id/documents', requireAuth,
  wrap(async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await ownSubmission(req.caregiverId, req.params.id))) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    next();
  }),
  upload.fields(Object.keys(DOC_FIELDS).map((name) => ({ name, maxCount: 1 }))),
  wrap(async (req, res) => {
    const files = Object.values(req.files || {}).flat();
    if (!files.length) return res.status(400).json({ error: 'No files received (JPG, PNG or PDF, up to 5 MB)' });
    const bad = files.find((f) => IMAGE_ONLY.has(DOC_FIELDS[f.fieldname]) && f.mimetype === 'application/pdf');
    if (bad) return res.status(400).json({ error: `${bad.fieldname} must be a photo (JPG or PNG), not a PDF` });

    // replace earlier uploads of the same type
    const types = files.map((f) => DOC_FIELDS[f.fieldname]);
    await db.query('DELETE FROM kyc_documents WHERE submission_id = $1 AND doc_type = ANY($2)', [req.params.id, types]);
    await saveDocs(req.caregiverId, req.params.id, files, (field) => DOC_FIELDS[field]);

    const { rows } = await db.query('SELECT doc_type FROM kyc_documents WHERE submission_id = $1', [req.params.id]);
    const have = new Set(rows.map((r) => r.doc_type));
    const idComplete = have.has('passport') || (have.has('id_front') && have.has('id_back'));
    if (idComplete) await advanceStatus(db, req.caregiverId, 'documents_uploaded');
    res.json({ uploaded: types, documents: [...have], idComplete });
  }));

// POST /kyc/submissions/:id/liveness-challenge  -> { nonce, challenge, expiresInSeconds }
router.post('/submissions/:id/liveness-challenge', requireAuth, wrap(async (req, res) => {
  if (!isUuid(req.params.id) || !(await ownSubmission(req.caregiverId, req.params.id))) {
    return res.status(404).json({ error: 'Submission not found' });
  }
  const settings = await loadSettings(db);
  const nonce = crypto.randomBytes(16).toString('hex');
  const challenge = crypto.randomInt(0, 2) === 0 ? 'turn_left' : 'turn_right';
  await db.query(
    `UPDATE kyc_submissions SET liveness_nonce = $2, liveness_challenge = $3, liveness_issued_at = now(),
        liveness_consumed_at = NULL WHERE submission_id = $1`, [req.params.id, nonce, challenge]);
  res.json({ nonce, challenge, expiresInSeconds: settings.liveness_nonce_ttl_seconds });
}));

// POST /kyc/submissions/:id/selfie  multipart: nonce, selfie_center (1), selfie_turn (1-3)
//   -> validates the nonce, stores the frames, runs verification, returns the decision
router.post('/submissions/:id/selfie', requireAuth,
  wrap(async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await ownSubmission(req.caregiverId, req.params.id))) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    next();
  }),
  upload.fields([{ name: 'selfie_center', maxCount: 1 }, { name: 'selfie_turn', maxCount: 3 }]),
  wrap(async (req, res) => {
    const sub = await ownSubmission(req.caregiverId, req.params.id);
    const settings = await loadSettings(db);
    const centre = req.files?.selfie_center?.[0];
    const turns = req.files?.selfie_turn || [];
    if (!centre || !turns.length) return res.status(400).json({ error: 'selfie_center and at least one selfie_turn are required' });

    // single-use, unexpired nonce
    const ageSec = sub.liveness_issued_at ? (Date.now() - new Date(sub.liveness_issued_at).getTime()) / 1000 : Infinity;
    if (!sub.liveness_nonce || req.body?.nonce !== sub.liveness_nonce) {
      return res.status(400).json({ error: 'Invalid liveness nonce. Request a new challenge.' });
    }
    if (sub.liveness_consumed_at) return res.status(400).json({ error: 'Challenge already used. Request a new one.' });
    if (ageSec > settings.liveness_nonce_ttl_seconds) return res.status(400).json({ error: 'Challenge expired. Request a new one.' });
    await db.query('UPDATE kyc_submissions SET liveness_consumed_at = now() WHERE submission_id = $1', [sub.submission_id]);

    await db.query(`DELETE FROM kyc_documents WHERE submission_id = $1 AND doc_type IN ('selfie_center','selfie_turn')`,
      [sub.submission_id]);
    await saveDocs(req.caregiverId, sub.submission_id, [centre, ...turns], (field) => field);
    await advanceStatus(db, req.caregiverId, 'liveness_done');

    try {
      const result = await runVerification(sub.submission_id);
      res.json(result);
    } catch (err) {
      await db.query(`UPDATE kyc_submissions SET status = 'pending' WHERE submission_id = $1`, [sub.submission_id]);
      if (err instanceof MlServiceError) return res.status(502).json({ error: err.message });
      throw err;
    }
  }));

// POST /kyc/submissions/:id/verify  -> re-runs verification on the stored files (no new upload)
router.post('/submissions/:id/verify', requireAuth, wrap(async (req, res) => {
  if (!isUuid(req.params.id) || !(await ownSubmission(req.caregiverId, req.params.id))) {
    return res.status(404).json({ error: 'Submission not found' });
  }
  try {
    res.json(await runVerification(req.params.id));
  } catch (err) {
    await db.query(`UPDATE kyc_submissions SET status = 'pending' WHERE submission_id = $1`, [req.params.id]);
    if (err instanceof MlServiceError) return res.status(502).json({ error: err.message });
    if (/required/.test(err.message)) return res.status(400).json({ error: err.message });
    throw err;
  }
}));

// GET /kyc/submissions/latest  -> the caregiver's most recent submission
// (used by the app after a fresh login, when it no longer knows the id)
router.get('/submissions/latest', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.submission_id, s.attempt_number, s.status, s.submitted_at,
            r.overall_confidence AS trust_score, r.report_details->'decision' AS decision,
            r.report_details->'reasons' AS reasons,
            (SELECT array_agg(doc_type) FROM kyc_documents d WHERE d.submission_id = s.submission_id) AS documents
       FROM kyc_submissions s LEFT JOIN verification_reports r USING (submission_id)
      WHERE s.caregiver_id = $1
      ORDER BY s.attempt_number DESC LIMIT 1`, [req.caregiverId]);
  if (!rows[0]) return res.status(404).json({ error: 'No submission yet' });
  res.json(rows[0]);
}));

// GET /kyc/submissions/:id  -> status for the Verification Status screen
router.get('/submissions/:id', requireAuth, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Submission not found' });
  const { rows } = await db.query(
    `SELECT s.submission_id, s.attempt_number, s.status, s.submitted_at,
            r.overall_confidence AS trust_score, r.report_details->'decision' AS decision,
            r.report_details->'reasons' AS reasons,
            (SELECT array_agg(doc_type) FROM kyc_documents d WHERE d.submission_id = s.submission_id) AS documents
       FROM kyc_submissions s LEFT JOIN verification_reports r USING (submission_id)
      WHERE s.submission_id = $1 AND s.caregiver_id = $2`, [req.params.id, req.caregiverId]);
  if (!rows[0]) return res.status(404).json({ error: 'Submission not found' });
  res.json(rows[0]);
}));

module.exports = router;
