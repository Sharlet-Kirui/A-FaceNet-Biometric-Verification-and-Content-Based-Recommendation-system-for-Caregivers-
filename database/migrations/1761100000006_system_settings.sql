-- Up Migration
-- M2: system_settings — admin-adjustable weights and thresholds for the trust
-- decision and liveness check (proposal 2.6: administrators set thresholds).
-- Values marked "calibrate" are placeholders until your own trials.

CREATE TABLE system_settings (
  setting_key varchar(50) PRIMARY KEY,
  value       numeric NOT NULL,
  description text,
  updated_by  uuid REFERENCES admins(admin_id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_settings_value_chk CHECK (value >= 0)
);

CREATE TRIGGER system_settings_set_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO system_settings (setting_key, value, description) VALUES
  ('weight_face',                    0.50,   'Weight of the face match score in the trust score'),
  ('weight_ocr',                     0.20,   'Weight of the OCR / typed-details agreement score'),
  ('weight_iprs',                    0.30,   'Weight of the IPRS (mock) record check'),
  ('trust_threshold',                0.75,   'Trust score at or above this is auto-approved; below goes to admin review'),
  ('face_distance_threshold',        1.0644, 'FaceNet euclidean_l2 distance threshold (LFW EER point); a distance at or above it fails the face gate'),
  ('blur_threshold',                 100,    'Minimum Laplacian variance for ID and selfie images'),
  ('liveness_min_turn_ratio',        0.25,   'Minimum nose-offset / eye-distance ratio for a head turn (calibrate)'),
  ('liveness_same_person_threshold', 1.25,   'Max FaceNet distance between centre and turn frames (calibrate)'),
  ('liveness_nonce_ttl_seconds',     120,    'Seconds a liveness challenge stays valid');

-- Down Migration
DROP TABLE IF EXISTS system_settings;
