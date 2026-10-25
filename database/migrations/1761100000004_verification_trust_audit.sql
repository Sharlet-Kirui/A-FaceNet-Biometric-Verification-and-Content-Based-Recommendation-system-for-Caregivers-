-- Up Migration
-- M2: verification_reports, trust_scores (0-1; UI multiplies by 100), audit_logs.
-- All scores are 0-1 so they share a scale with cosine / confidence values.

CREATE TABLE verification_reports (
  report_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id            uuid NOT NULL UNIQUE REFERENCES kyc_submissions(submission_id) ON DELETE CASCADE,
  face_detection_score     numeric(4,3),
  facenet_distance         real,                 -- raw Euclidean-L2 distance (selfie vs ID photo)
  facenet_match_score      numeric(4,3),
  ocr_score                numeric(4,3),
  liveness_score           numeric(4,3),
  iprs_verification_status varchar(15) NOT NULL DEFAULT 'not_checked',
  overall_confidence       numeric(4,3),
  report_details           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                   varchar(15) NOT NULL DEFAULT 'generated',
  generated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vr_face_detection_chk CHECK (face_detection_score IS NULL OR face_detection_score BETWEEN 0 AND 1),
  CONSTRAINT vr_facenet_chk        CHECK (facenet_match_score  IS NULL OR facenet_match_score  BETWEEN 0 AND 1),
  CONSTRAINT vr_ocr_chk            CHECK (ocr_score            IS NULL OR ocr_score            BETWEEN 0 AND 1),
  CONSTRAINT vr_liveness_chk       CHECK (liveness_score       IS NULL OR liveness_score       BETWEEN 0 AND 1),
  CONSTRAINT vr_overall_chk        CHECK (overall_confidence   IS NULL OR overall_confidence   BETWEEN 0 AND 1),
  CONSTRAINT vr_iprs_chk CHECK (iprs_verification_status IN ('not_checked','verified','mismatch','unavailable')),
  CONSTRAINT vr_status_chk CHECK (status IN ('generated','reviewed'))
);

CREATE TABLE trust_scores (
  trust_score_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL UNIQUE REFERENCES verification_reports(report_id) ON DELETE CASCADE,
  caregiver_id    uuid NOT NULL UNIQUE REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
  score           numeric(4,3) NOT NULL,
  is_verified     boolean NOT NULL DEFAULT false,
  badge_issued_at timestamptz,
  valid_until     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trust_scores_score_chk CHECK (score BETWEEN 0 AND 1)
);

CREATE TABLE audit_logs (
  log_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id       uuid REFERENCES admins(admin_id) ON DELETE SET NULL,
  trust_score_id uuid REFERENCES trust_scores(trust_score_id) ON DELETE SET NULL,
  action_type    varchar(50) NOT NULL,
  rule_applied   varchar(100),
  action_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address     inet,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_admin_idx ON audit_logs (admin_id, created_at DESC);
CREATE INDEX audit_logs_trust_idx ON audit_logs (trust_score_id);

-- Down Migration
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS trust_scores;
DROP TABLE IF EXISTS verification_reports;
