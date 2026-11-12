-- Up Migration
-- 1. Registry switch (like liveness_enforced): 1 = IPRS is a required gate; 0 = not checked,
--    left out of the trust score and recorded as "iprs_not_checked" in every report.
INSERT INTO system_settings (setting_key, value, description) VALUES
  ('iprs_enforced', 1, '1 = the registry (IPRS) check is required; 0 = not checked (pilot without registry access, recorded in every report)')
ON CONFLICT (setting_key) DO NOTHING;

-- 2. Privacy notice accepted at sign-up (Data Protection Act 2019: duty to notify)
ALTER TABLE caregivers ADD COLUMN privacy_version varchar(10);
ALTER TABLE caregivers ADD COLUMN privacy_accepted_at timestamptz;

-- 3. Application outcome set by administrators
ALTER TABLE job_matches DROP CONSTRAINT job_matches_status_chk;
ALTER TABLE job_matches ADD CONSTRAINT job_matches_status_chk CHECK
  (status IN ('suggested','viewed','interested','shortlisted','declined','dismissed'));

-- 4. In-app notifications for caregivers
CREATE TABLE notifications (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id    uuid NOT NULL REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
  type            varchar(40) NOT NULL,
  title           varchar(150) NOT NULL,
  body            text,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_caregiver_idx ON notifications (caregiver_id, created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS notifications;
UPDATE job_matches SET status = 'interested' WHERE status IN ('shortlisted', 'declined');
ALTER TABLE job_matches DROP CONSTRAINT job_matches_status_chk;
ALTER TABLE job_matches ADD CONSTRAINT job_matches_status_chk CHECK
  (status IN ('suggested','viewed','interested','dismissed'));
ALTER TABLE caregivers DROP COLUMN IF EXISTS privacy_accepted_at;
ALTER TABLE caregivers DROP COLUMN IF EXISTS privacy_version;
DELETE FROM system_settings WHERE setting_key = 'iprs_enforced';
