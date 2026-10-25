-- Up Migration
-- M2: skill taxonomy, caregiver skills, availability, credentials, work history.
-- skill_tags holds specializations, technical skills, languages and certifications
-- in one table so every recommender dimension comes from a single vocabulary.

CREATE TABLE skill_tags (
  skill_tag_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name   varchar(100) NOT NULL,
  category     varchar(20)  NOT NULL,
  description  text,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT skill_tags_category_chk CHECK
    (category IN ('specialization','technical','language','certification')),
  CONSTRAINT skill_tags_name_category_uq UNIQUE (skill_name, category)
);

CREATE TABLE caregiver_skills (
  caregiver_id      uuid NOT NULL REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
  skill_tag_id      uuid NOT NULL REFERENCES skill_tags(skill_tag_id) ON DELETE RESTRICT,
  proficiency_level smallint NOT NULL DEFAULT 3,
  verified          boolean  NOT NULL DEFAULT false,
  added_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (caregiver_id, skill_tag_id),
  CONSTRAINT caregiver_skills_proficiency_chk CHECK (proficiency_level BETWEEN 1 AND 5)
);
CREATE INDEX caregiver_skills_skill_idx ON caregiver_skills (skill_tag_id);

CREATE TABLE caregiver_availability (
  caregiver_id uuid NOT NULL REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
  day_of_week  smallint NOT NULL,          -- 0 = Sunday ... 6 = Saturday
  shift        varchar(15) NOT NULL,
  PRIMARY KEY (caregiver_id, day_of_week, shift),
  CONSTRAINT caregiver_availability_day_chk CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT caregiver_availability_shift_chk CHECK
    (shift IN ('morning','afternoon','night','live_in'))
);

CREATE TABLE caregiver_credentials (
  credential_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id      uuid NOT NULL REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
  credential_type   varchar(30) NOT NULL,
  reference_number  varchar(100),
  issuing_authority varchar(150),
  expiry_date       date,
  status            varchar(15) NOT NULL DEFAULT 'pending',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caregiver_credentials_type_chk CHECK
    (credential_type IN ('police_clearance','professional_license','tvet_cdacc')),
  CONSTRAINT caregiver_credentials_status_chk CHECK
    (status IN ('pending','verified','rejected','expired'))
);
CREATE INDEX caregiver_credentials_caregiver_idx ON caregiver_credentials (caregiver_id);

CREATE TABLE work_history (
  work_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id uuid NOT NULL REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
  employer     varchar(150) NOT NULL,
  role         varchar(100) NOT NULL,
  duties       text,
  from_year    smallint NOT NULL,
  to_year      smallint,                    -- NULL = current role
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_history_years_chk CHECK
    (from_year BETWEEN 1960 AND 2100 AND (to_year IS NULL OR to_year >= from_year))
);
CREATE INDEX work_history_caregiver_idx ON work_history (caregiver_id);

-- Down Migration
DROP TABLE IF EXISTS work_history;
DROP TABLE IF EXISTS caregiver_credentials;
DROP TABLE IF EXISTS caregiver_availability;
DROP TABLE IF EXISTS caregiver_skills;
DROP TABLE IF EXISTS skill_tags;
