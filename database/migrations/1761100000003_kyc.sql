-- Up Migration
-- M2: KYC submissions, uploaded documents (incl. CV and liveness frames),
-- face embeddings (pgvector if available, otherwise real[128]).

CREATE TABLE kyc_submissions (
  submission_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id           uuid NOT NULL REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
  attempt_number         integer NOT NULL DEFAULT 1,
  status                 varchar(15) NOT NULL DEFAULT 'pending',
  biometric_consent      boolean NOT NULL DEFAULT false,
  iprs_consent           boolean NOT NULL DEFAULT false,
  -- liveness challenge issued by the server; the app must echo the nonce
  liveness_nonce         varchar(64),
  liveness_challenge     varchar(15),
  liveness_issued_at     timestamptz,
  liveness_consumed_at   timestamptz,
  notes                  text,
  submitted_at           timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kyc_submissions_status_chk CHECK
    (status IN ('pending','processing','approved','rejected','flagged')),
  CONSTRAINT kyc_submissions_challenge_chk CHECK
    (liveness_challenge IS NULL OR liveness_challenge IN ('turn_left','turn_right')),
  CONSTRAINT kyc_submissions_attempt_chk CHECK (attempt_number >= 1),
  CONSTRAINT kyc_submissions_attempt_uq UNIQUE (caregiver_id, attempt_number)
);
CREATE INDEX kyc_submissions_status_idx ON kyc_submissions (status);

CREATE TABLE kyc_documents (
  document_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id  uuid NOT NULL REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
  submission_id uuid REFERENCES kyc_submissions(submission_id) ON DELETE SET NULL,
  doc_type      varchar(20) NOT NULL,
  storage_url   varchar(255) NOT NULL,
  mime_type     varchar(50),
  size_bytes    integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kyc_documents_type_chk CHECK (doc_type IN (
    'id_front','id_back','passport','good_conduct','tvet_cdacc','license',
    'cv','other','selfie_center','selfie_turn','selfie_blink'))
);
CREATE INDEX kyc_documents_caregiver_idx ON kyc_documents (caregiver_id, doc_type);
CREATE INDEX kyc_documents_submission_idx ON kyc_documents (submission_id);

-- Face embeddings: use pgvector's vector(128) when the extension can be
-- created, otherwise fall back to real[] with a length check.
DO $$
DECLARE
  col_type text;
  len_chk  text := '';
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
    col_type := 'vector(128)';
  EXCEPTION WHEN OTHERS THEN
    col_type := 'real[]';
    len_chk  := ', CONSTRAINT face_embeddings_len_chk CHECK (array_length(embedding, 1) = 128)';
    RAISE NOTICE 'pgvector not available - face_embeddings.embedding is real[128]';
  END;

  EXECUTE format($f$
    CREATE TABLE face_embeddings (
      embedding_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id uuid NOT NULL REFERENCES kyc_submissions(submission_id) ON DELETE CASCADE,
      source        varchar(15) NOT NULL,
      embedding     %s NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT face_embeddings_source_chk CHECK (source IN ('id_document','selfie')),
      CONSTRAINT face_embeddings_unique_source UNIQUE (submission_id, source)
      %s
    )$f$, col_type, len_chk);
END $$;

-- Down Migration
DROP TABLE IF EXISTS face_embeddings;
DROP TABLE IF EXISTS kyc_documents;
DROP TABLE IF EXISTS kyc_submissions;
