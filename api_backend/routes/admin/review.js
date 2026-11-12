// Verification review: queue, full report, document files, approve / reject.
const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('../../db');
const { decryptId } = require('../../services/idCrypto');
const { loadSettings } = require('../../services/trustScore');
const { notify, verificationMessage } = require('../../services/notify');
const { wrap, isUuid, page, audit } = require('./util');

const router = express.Router();
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'));
const STATUSES = ['pending', 'processing', 'flagged', 'approved', 'rejected'];

const num = (v) => (v == null ? null : Number(v));

// GET /admin/submissions?status=flagged|pending|approved|rejected|all&search=&limit=&offset=
router.get('/submissions', wrap(async (req, res) => {
  const status = req.query.status || 'flagged';
  if (status !== 'all' && !STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const { limit, offset } = page(req.query);
  const search = String(req.query.search || '').trim();
  const params = [];
  const where = [];
  if (status !== 'all') { params.push(status); where.push(`s.status = $${params.length}`); }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(lower(c.first_name || ' ' || c.last_name) LIKE $${params.length} OR lower(c.email) LIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT s.submission_id, s.attempt_number, s.status, s.submitted_at,
            c.caregiver_id, c.first_name, c.last_name, c.email, c.county,
            r.overall_confidence, r.facenet_distance, r.ocr_score, r.liveness_score, r.iprs_verification_status,
            r.report_details->'failedGates' AS failed_gates, r.report_details->'reasons' AS reasons,
            count(*) OVER () AS total
       FROM kyc_submissions s
       JOIN caregivers c USING (caregiver_id)
       LEFT JOIN verification_reports r USING (submission_id)
       ${whereSql}
      ORDER BY s.submitted_at ASC
      LIMIT ${limit} OFFSET ${offset}`, params);
  const counts = await db.query('SELECT status, count(*)::int AS n FROM kyc_submissions GROUP BY status');
  res.json({
    total: Number(rows[0]?.total || 0),
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
    submissions: rows.map((r) => ({
      submissionId: r.submission_id,
      attemptNumber: r.attempt_number,
      status: r.status,
      submittedAt: r.submitted_at,
      caregiver: { caregiverId: r.caregiver_id, name: `${r.first_name} ${r.last_name}`, email: r.email, county: r.county },
      trustScore: num(r.overall_confidence),
      faceDistance: num(r.facenet_distance),
      ocrScore: num(r.ocr_score),
      livenessScore: num(r.liveness_score),
      iprsStatus: r.iprs_verification_status,
      failedGates: r.failed_gates || [],
      reasons: r.reasons || [],
    })),
  });
}));

// GET /admin/submissions/:id  -> everything the reviewer needs on one screen
router.get('/submissions/:id', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Submission not found' });
  const sub = (await db.query(
    `SELECT s.*, c.first_name, c.last_name, c.email, c.phone, to_char(c.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
            c.gender, c.nationality, c.id_type, c.id_number_encrypted, c.street, c.town, c.county,
            c.experience_years, c.onboarding_status
       FROM kyc_submissions s JOIN caregivers c USING (caregiver_id) WHERE s.submission_id = $1`,
    [req.params.id])).rows[0];
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  const report = (await db.query('SELECT * FROM verification_reports WHERE submission_id = $1', [sub.submission_id])).rows[0];
  const trust = (await db.query('SELECT * FROM trust_scores WHERE caregiver_id = $1', [sub.caregiver_id])).rows[0];
  const docs = (await db.query(
    `SELECT document_id, doc_type, mime_type, size_bytes, storage_url, created_at FROM kyc_documents
      WHERE submission_id = $1 ORDER BY created_at`, [sub.submission_id])).rows;
  const credentials = (await db.query(
    `SELECT credential_type, reference_number, issuing_authority, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date, status
       FROM caregiver_credentials WHERE caregiver_id = $1`, [sub.caregiver_id])).rows;
  const work = (await db.query(
    'SELECT employer, role, duties, from_year, to_year FROM work_history WHERE caregiver_id = $1 ORDER BY from_year DESC',
    [sub.caregiver_id])).rows;
  const history = (await db.query(
    `SELECT l.action_type, l.rule_applied, l.action_details, l.created_at, a.first_name || ' ' || a.last_name AS admin_name
       FROM audit_logs l LEFT JOIN admins a USING (admin_id)
      WHERE l.action_details->>'submissionId' = $1 ORDER BY l.created_at`, [sub.submission_id])).rows;
  const attempts = (await db.query(
    'SELECT submission_id, attempt_number, status, submitted_at FROM kyc_submissions WHERE caregiver_id = $1 ORDER BY attempt_number',
    [sub.caregiver_id])).rows;

  // current thresholds, for reports that did not store the ones they were decided with (seeded data)
  const settings = await loadSettings(db);

  let idNumber = null;
  try { idNumber = sub.id_number_encrypted ? decryptId(sub.id_number_encrypted) : null; } catch { idNumber = null; }

  res.json({
    submissionId: sub.submission_id,
    attemptNumber: sub.attempt_number,
    status: sub.status,
    submittedAt: sub.submitted_at,
    livenessChallenge: sub.liveness_challenge,
    currentThresholds: { faceDistance: settings.face_distance_threshold, trust: settings.trust_threshold,
      blur: settings.blur_threshold },
    caregiver: {
      caregiverId: sub.caregiver_id, firstName: sub.first_name, lastName: sub.last_name, email: sub.email,
      phone: sub.phone, dateOfBirth: sub.date_of_birth, gender: sub.gender, nationality: sub.nationality,
      idType: sub.id_type, idNumber, street: sub.street, town: sub.town, county: sub.county,
      experienceYears: sub.experience_years, onboardingStatus: sub.onboarding_status,
    },
    report: report && {
      faceDetectionScore: num(report.face_detection_score),
      faceDistance: num(report.facenet_distance),
      faceMatchScore: num(report.facenet_match_score),
      ocrScore: num(report.ocr_score),
      livenessScore: num(report.liveness_score),
      iprsStatus: report.iprs_verification_status,
      trustScore: num(report.overall_confidence),
      reviewStatus: report.status,
      generatedAt: report.generated_at,
      details: report.report_details,
    },
    trust: trust && { score: num(trust.score), isVerified: trust.is_verified, validUntil: trust.valid_until },
    documents: docs.map((d) => ({
      documentId: d.document_id, docType: d.doc_type, mimeType: d.mime_type, sizeBytes: d.size_bytes,
      uploadedAt: d.created_at, hasFile: !String(d.storage_url).startsWith('seed://'),
    })),
    credentials,
    workHistory: work,
    attempts: attempts.map((a) => ({ submissionId: a.submission_id, attemptNumber: a.attempt_number, status: a.status, submittedAt: a.submitted_at })),
    history: history.map((h) => ({ actionType: h.action_type, rule: h.rule_applied, details: h.action_details, at: h.created_at, adminName: h.admin_name })),
  });
}));

// GET /admin/documents/:documentId  -> the file itself (images and PDFs), only from the upload folder
router.get('/documents/:documentId', wrap(async (req, res) => {
  if (!isUuid(req.params.documentId)) return res.status(404).json({ error: 'Document not found' });
  const doc = (await db.query('SELECT storage_url, mime_type FROM kyc_documents WHERE document_id = $1',
    [req.params.documentId])).rows[0];
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (String(doc.storage_url).startsWith('seed://')) {
    return res.status(404).json({ error: 'Seeded record: no file was uploaded', reason: 'seeded' });
  }
  const file = path.resolve(doc.storage_url);
  if (!file.startsWith(UPLOAD_ROOT + path.sep) || !fs.existsSync(file)) {
    return res.status(404).json({ error: 'File not found on the server' });
  }
  res.set('Cache-Control', 'private, no-store');
  res.type(doc.mime_type || path.extname(file));
  res.sendFile(file);
}));

// POST /admin/submissions/:id/decision  { decision: 'approve' | 'reject', reason }
router.post('/submissions/:id/decision', wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Submission not found' });
  const decision = req.body?.decision;
  const reason = String(req.body?.reason || '').trim();
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'decision must be approve or reject' });
  if (decision === 'reject' && reason.length < 5) {
    return res.status(400).json({ error: 'Give a reason for the rejection (at least 5 characters)', fields: { reason: 'required' } });
  }

  const result = await db.transaction(async (c) => {
    const sub = (await c.query(
      'SELECT submission_id, caregiver_id, status FROM kyc_submissions WHERE submission_id = $1 FOR UPDATE',
      [req.params.id])).rows[0];
    if (!sub) return { status: 404, body: { error: 'Submission not found' } };
    if (sub.status === 'processing') return { status: 409, body: { error: 'Verification is still running for this submission' } };

    const report = (await c.query(
      `SELECT report_id, report_details->>'decision' AS auto_decision FROM verification_reports WHERE submission_id = $1`,
      [sub.submission_id])).rows[0];
    if (!report) return { status: 409, body: { error: 'No verification report yet: the checks have not run for this submission' } };

    const approve = decision === 'approve';
    await c.query('UPDATE kyc_submissions SET status = $2, notes = $3 WHERE submission_id = $1',
      [sub.submission_id, approve ? 'approved' : 'rejected', reason || null]);
    await c.query(`UPDATE verification_reports SET status = 'reviewed' WHERE report_id = $1`, [report.report_id]);
    await c.query('UPDATE caregivers SET onboarding_status = $2 WHERE caregiver_id = $1',
      [sub.caregiver_id, approve ? 'verified' : 'rejected']);
    const trust = (await c.query(
      `UPDATE trust_scores SET is_verified = $2,
              badge_issued_at = CASE WHEN $2 THEN now() END,
              valid_until = CASE WHEN $2 THEN now() + interval '1 year' END
        WHERE caregiver_id = $1 RETURNING trust_score_id`, [sub.caregiver_id, approve])).rows[0];

    await audit(c, req, {
      actionType: approve ? 'admin_approve' : 'admin_reject',
      rule: 'manual_review',
      trustScoreId: trust?.trust_score_id || null,
      details: { submissionId: sub.submission_id, caregiverId: sub.caregiver_id, previousStatus: sub.status,
        automaticDecision: report.auto_decision, reason: reason || null },
    });
    const [type, title, body] = verificationMessage(approve, { byAdmin: true, reason: reason || null });
    await notify(c, sub.caregiver_id, type, title, body, { submissionId: sub.submission_id });
    return { status: 200, body: { submissionId: sub.submission_id, status: approve ? 'approved' : 'rejected',
      caregiverStatus: approve ? 'verified' : 'rejected' } };
  });
  res.status(result.status).json(result.body);
}));

module.exports = router;
