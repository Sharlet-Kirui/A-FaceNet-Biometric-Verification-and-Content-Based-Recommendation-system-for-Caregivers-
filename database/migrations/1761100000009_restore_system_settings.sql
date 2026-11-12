-- Up Migration
-- Puts back any missing system_settings rows. Earlier versions of the seed emptied
-- this table (TRUNCATE admins CASCADE reaches it through updated_by). Existing values
-- are kept: ON CONFLICT DO NOTHING only fills gaps, so this is safe to run anywhere.
INSERT INTO system_settings (setting_key, value, description) VALUES
  ('weight_face',                    0.50,   'Weight of the face match score in the trust score'),
  ('weight_ocr',                     0.20,   'Weight of the OCR / typed-details agreement score'),
  ('weight_iprs',                    0.30,   'Weight of the IPRS (mock) record check'),
  ('trust_threshold',                0.75,   'Trust score at or above this is auto-approved; below goes to admin review'),
  ('face_distance_threshold',        1.0958, 'FaceNet euclidean_l2 distance threshold (EER on LFW, migration 8)'),
  ('blur_threshold',                 100,    'Minimum Laplacian variance for ID and selfie images'),
  ('liveness_min_turn_ratio',        0.25,   'Minimum nose-offset / eye-distance ratio for a head turn (calibrate)'),
  ('liveness_same_person_threshold', 1.25,   'Max FaceNet distance between centre and turn frames (calibrate)'),
  ('liveness_nonce_ttl_seconds',     120,    'Seconds a liveness challenge stays valid'),
  ('liveness_enforced',              1,      '1 = liveness is a required gate; 0 = skipped (development only, recorded in every report)')
ON CONFLICT (setting_key) DO NOTHING;

-- Down Migration
-- Nothing to undo: the rows belong to migrations 6-8.
SELECT 1;
