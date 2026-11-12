-- Up Migration
-- Adds the liveness_enforced switch. Keep it at 1. Set it to 0 only while the
-- FastAPI /liveness endpoint does not exist yet; every report then records
-- "liveness_not_enforced" so the skipped check is visible to admins and in testing.

INSERT INTO system_settings (setting_key, value, description) VALUES
  ('liveness_enforced', 1, '1 = liveness is a required gate; 0 = skipped (development only, recorded in every report)')
ON CONFLICT (setting_key) DO NOTHING;

-- Down Migration
DELETE FROM system_settings WHERE setting_key = 'liveness_enforced';
