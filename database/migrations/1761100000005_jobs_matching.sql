-- Up Migration
-- M2: job_categories, job_postings, job_skill_requirements, job_matches,
-- caregiver_skill_vectors (stored SkillVector; pgvector if available, else real[]).

CREATE TABLE job_categories (
  category_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               varchar(100) NOT NULL UNIQUE,
  description        text,
  parent_category_id uuid REFERENCES job_categories(category_id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER job_categories_set_updated_at
  BEFORE UPDATE ON job_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE job_postings (
  job_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                varchar(150) NOT NULL,
  description          text,
  category_id          uuid NOT NULL REFERENCES job_categories(category_id) ON DELETE RESTRICT,
  county               varchar(50)  NOT NULL,
  location_detail      varchar(150),
  job_type             varchar(15)  NOT NULL DEFAULT 'full_time',
  shift                varchar(15)  NOT NULL DEFAULT 'morning',
  min_experience_years smallint     NOT NULL DEFAULT 0,
  salary_min_kes       integer,
  salary_max_kes       integer,
  status               varchar(10)  NOT NULL DEFAULT 'open',
  posted_by            uuid REFERENCES admins(admin_id) ON DELETE SET NULL,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT job_postings_type_chk CHECK
    (job_type IN ('full_time','part_time','live_in','temporary')),
  CONSTRAINT job_postings_shift_chk CHECK
    (shift IN ('morning','afternoon','night','live_in')),
  CONSTRAINT job_postings_status_chk CHECK
    (status IN ('draft','open','filled','closed')),
  CONSTRAINT job_postings_exp_chk CHECK (min_experience_years BETWEEN 0 AND 60),
  CONSTRAINT job_postings_salary_chk CHECK
    (salary_min_kes IS NULL OR salary_max_kes IS NULL OR salary_max_kes >= salary_min_kes)
);
CREATE INDEX job_postings_filter_idx ON job_postings (status, county);
CREATE INDEX job_postings_category_idx ON job_postings (category_id);
CREATE TRIGGER job_postings_set_updated_at
  BEFORE UPDATE ON job_postings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE job_skill_requirements (
  job_id               uuid NOT NULL REFERENCES job_postings(job_id) ON DELETE CASCADE,
  skill_tag_id         uuid NOT NULL REFERENCES skill_tags(skill_tag_id) ON DELETE RESTRICT,
  required_proficiency smallint NOT NULL DEFAULT 3,
  importance           numeric(3,2) NOT NULL DEFAULT 1.00,   -- weight in the match score, 0-1
  PRIMARY KEY (job_id, skill_tag_id),
  CONSTRAINT jsr_proficiency_chk CHECK (required_proficiency BETWEEN 1 AND 5),
  CONSTRAINT jsr_importance_chk  CHECK (importance BETWEEN 0 AND 1)
);

CREATE TABLE job_matches (
  match_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id uuid NOT NULL REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
  job_id       uuid NOT NULL REFERENCES job_postings(job_id) ON DELETE CASCADE,
  match_score  numeric(5,4) NOT NULL,
  rank         smallint,
  reasons      jsonb NOT NULL DEFAULT '[]'::jsonb,
  status       varchar(15) NOT NULL DEFAULT 'suggested',
  matched_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_matches_score_chk CHECK (match_score BETWEEN 0 AND 1),
  CONSTRAINT job_matches_status_chk CHECK
    (status IN ('suggested','viewed','interested','dismissed')),
  CONSTRAINT job_matches_pair_uq UNIQUE (caregiver_id, job_id)
);
CREATE INDEX job_matches_rank_idx ON job_matches (caregiver_id, rank);

DO $$
DECLARE col_type text;
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
    col_type := 'vector';
  EXCEPTION WHEN OTHERS THEN
    col_type := 'real[]';
  END;
  EXECUTE format($f$
    CREATE TABLE caregiver_skill_vectors (
      caregiver_id uuid PRIMARY KEY REFERENCES caregivers(caregiver_id) ON DELETE CASCADE,
      skill_vector %s NOT NULL,
      vocab_version smallint NOT NULL DEFAULT 1,
      updated_at   timestamptz NOT NULL DEFAULT now()
    )$f$, col_type);
END $$;

-- Down Migration
DROP TABLE IF EXISTS caregiver_skill_vectors;
DROP TABLE IF EXISTS job_matches;
DROP TABLE IF EXISTS job_skill_requirements;
DROP TABLE IF EXISTS job_postings;
DROP TABLE IF EXISTS job_categories;
