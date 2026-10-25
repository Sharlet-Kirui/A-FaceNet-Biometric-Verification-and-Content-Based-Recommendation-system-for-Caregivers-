-- Up Migration
-- M2: caregivers, email_otps, admins, shared updated_at trigger.
-- Decisions: timestamptz everywhere; CHECK constraints instead of enums;
-- unique index on lower(email); national ID stored encrypted + HMAC hash.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE caregivers (
  caregiver_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name           varchar(50)  NOT NULL,
  last_name            varchar(50)  NOT NULL,
  email                varchar(100) NOT NULL,
  password_hash        varchar(255) NOT NULL,
  email_verified_at    timestamptz,
  phone                varchar(20),
  date_of_birth        date,
  gender               varchar(20),
  nationality          varchar(50),
  id_type              varchar(20),
  id_number_encrypted  text,          -- AES-256-GCM, readable by backend for IPRS / admin review
  id_number_hash       char(64),      -- HMAC-SHA256 (server secret), used only for uniqueness
  street               varchar(150),
  town                 varchar(100),
  county               varchar(50),
  postal_code          varchar(20),
  country              varchar(50) NOT NULL DEFAULT 'Kenya',
  experience_years     smallint,
  onboarding_status    varchar(30) NOT NULL DEFAULT 'registered',
  biometric_consent_at timestamptz,
  iprs_consent_at      timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT caregivers_gender_chk CHECK
    (gender IS NULL OR gender IN ('female','male','other','prefer_not_to_say')),
  CONSTRAINT caregivers_id_type_chk CHECK
    (id_type IS NULL OR id_type IN ('national_id','passport')),
  CONSTRAINT caregivers_experience_chk CHECK
    (experience_years IS NULL OR experience_years BETWEEN 0 AND 60),
  CONSTRAINT caregivers_onboarding_status_chk CHECK (onboarding_status IN (
    'registered','email_verified','details_submitted','documents_uploaded',
    'liveness_done','under_review','verified','rejected'))
);

-- Case-insensitive unique email
CREATE UNIQUE INDEX caregivers_email_lower_uq ON caregivers (lower(email));
-- One person per (document type, issuing country, number)
CREATE UNIQUE INDEX caregivers_identity_uq
  ON caregivers (id_type, nationality, id_number_hash)
  WHERE id_number_hash IS NOT NULL;
CREATE INDEX caregivers_county_idx ON caregivers (county);
CREATE INDEX caregivers_status_idx ON caregivers (onboarding_status);

CREATE TRIGGER caregivers_set_updated_at
  BEFORE UPDATE ON caregivers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE email_otps (
  otp_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id uuid NOT NULL REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
  code_hash    char(64) NOT NULL,                 -- never store the raw code
  purpose      varchar(30) NOT NULL DEFAULT 'email_verification',
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  attempts     smallint NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_otps_purpose_chk CHECK (purpose IN ('email_verification','password_reset')),
  CONSTRAINT email_otps_attempts_chk CHECK (attempts >= 0)
);
CREATE INDEX email_otps_lookup_idx ON email_otps (caregiver_id, purpose, created_at DESC);

CREATE TABLE admins (
  admin_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    varchar(50)  NOT NULL,
  last_name     varchar(50)  NOT NULL,
  email         varchar(100) NOT NULL,
  password_hash varchar(255) NOT NULL,
  role_level    varchar(20)  NOT NULL DEFAULT 'reviewer',
  is_active     boolean      NOT NULL DEFAULT true,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT admins_role_chk CHECK (role_level IN ('super_admin','reviewer'))
);
CREATE UNIQUE INDEX admins_email_lower_uq ON admins (lower(email));

-- Down Migration
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS email_otps;
DROP TABLE IF EXISTS caregivers;
DROP FUNCTION IF EXISTS set_updated_at();
