   -- Up Migration
   -- Face threshold from the corrected LFW evaluation (EER on 790 DevTest pairs, 10-fold CV stable at 1.0959 +- 0.0047)
   UPDATE system_settings SET value = 1.0958 WHERE setting_key = 'face_distance_threshold';

   -- Down Migration
   UPDATE system_settings SET value = 1.0644 WHERE setting_key = 'face_distance_threshold';