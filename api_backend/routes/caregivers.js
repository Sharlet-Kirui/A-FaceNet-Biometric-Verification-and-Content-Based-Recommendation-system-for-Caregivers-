// /caregivers/me: profile, Details screen and Specialties screen. /skill-tags: vocabulary.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { encryptId, hashId } = require('../services/idCrypto');
const { advanceStatus } = require('../services/onboarding');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const GENDERS = { 'female': 'female', 'male': 'male', 'other': 'other', 'prefer not to say': 'prefer_not_to_say',
  'prefer_not_to_say': 'prefer_not_to_say' };
const ID_TYPES = { 'national id': 'national_id', 'national_id': 'national_id', 'passport': 'passport' };
const clean = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

// App labels that differ from the database vocabulary (skill_tags.skill_name)
const SKILL_ALIASES = {
  'dementia care': "Dementia & Alzheimer's Care",
  'newborn care': 'Child & Newborn Care',
  'post-op recovery': 'Post-Surgery Recovery',
  'first aid certified': 'CPR & First Aid',
  'physiotherapy basics': 'Physiotherapy Assistance',
  'blood pressure monitoring': 'Vital Signs Monitoring',
  'diabetes care': 'Diabetic Care',
  'medication management': 'Medication Administration',
  'swahili': 'Kiswahili',
};
// The app collects shift types but not days, so a shift applies to every day for now.
const SHIFT_MAP = { 'live-in': ['live_in'], 'day-shift': ['morning', 'afternoon'], 'night-shift': ['night'],
  'morning': ['morning'], 'afternoon': ['afternoon'], 'night': ['night'], 'live_in': ['live_in'] };

// GET /skill-tags -> vocabulary grouped by category (the app can load its options from here)
router.get('/skill-tags', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT skill_tag_id, skill_name, category FROM skill_tags ORDER BY category, skill_name');
  const grouped = {};
  for (const r of rows) (grouped[r.category] ||= []).push({ id: r.skill_tag_id, name: r.skill_name });
  res.json(grouped);
}));

// GET /caregivers/me
router.get('/caregivers/me', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT caregiver_id, first_name, last_name, email, phone, to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth, gender, nationality, id_type,
            street, town, county, postal_code, country, experience_years, onboarding_status, email_verified_at
       FROM caregivers WHERE caregiver_id = $1`, [req.caregiverId]);
  if (!rows[0]) return res.status(404).json({ error: 'Caregiver not found' });
  const skills = await db.query(
    `SELECT t.skill_name, t.category, cs.proficiency_level FROM caregiver_skills cs
       JOIN skill_tags t USING (skill_tag_id) WHERE cs.caregiver_id = $1 ORDER BY t.category, t.skill_name`,
    [req.caregiverId]);
  const trust = await db.query('SELECT score, is_verified FROM trust_scores WHERE caregiver_id = $1', [req.caregiverId]);
  res.json({ ...rows[0], skills: skills.rows, trust: trust.rows[0] || null });
}));

// PUT /caregivers/me/details  (payload of details_screen.dart)
router.put('/caregivers/me/details', requireAuth, wrap(async (req, res) => {
  const b = req.body || {};
  const gender = b.gender == null ? null : GENDERS[String(b.gender).toLowerCase()];
  const idType = ID_TYPES[String(b.idType || '').toLowerCase()];
  const idNumber = clean(b.idNumber)?.toUpperCase();
  const errors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dateOfBirth || '')) errors.dateOfBirth = 'use YYYY-MM-DD';
  if (b.gender != null && !gender) errors.gender = 'invalid';
  if (!idType) errors.idType = 'National ID or Passport';
  if (!idNumber || !/^[A-Z0-9]{5,20}$/.test(idNumber)) errors.idNumber = '5-20 letters or numbers';
  if (!clean(b.nationality)) errors.nationality = 'required';
  if (!clean(b.address?.county)) errors.county = 'required';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Validation failed', fields: errors });

  const nationality = clean(b.nationality);
  try {
    await db.transaction(async (c) => {
      await c.query(
        `UPDATE caregivers SET date_of_birth = $2, phone = COALESCE($3, phone), gender = $4, nationality = $5,
            id_type = $6, id_number_encrypted = $7, id_number_hash = $8, street = $9, town = $10, county = $11,
            postal_code = $12, country = COALESCE($13, country), experience_years = $14
          WHERE caregiver_id = $1`,
        [req.caregiverId, b.dateOfBirth, clean(b.phone), gender, nationality, idType, encryptId(idNumber),
          hashId(idType, nationality, idNumber), clean(b.address?.street), clean(b.address?.town),
          clean(b.address?.county), clean(b.address?.postalCode), clean(b.address?.country),
          Number.isInteger(b.experienceYears) ? b.experienceYears : null]);

      for (const [key, type] of [['policeClearance', 'police_clearance'], ['professionalLicense', 'professional_license']]) {
        await c.query('DELETE FROM caregiver_credentials WHERE caregiver_id = $1 AND credential_type = $2', [req.caregiverId, type]);
        const cr = b[key] || {};
        const ref = clean(cr.referenceNumber ?? cr.licenseNumber);
        if (ref) {
          await c.query(
            `INSERT INTO caregiver_credentials (caregiver_id, credential_type, reference_number, issuing_authority, expiry_date)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.caregiverId, type, ref, clean(cr.issuingAuthority), clean(cr.expiryDate)]);
        }
      }

      await c.query('DELETE FROM work_history WHERE caregiver_id = $1', [req.caregiverId]);
      for (const w of Array.isArray(b.workHistory) ? b.workHistory : []) {
        if (!clean(w.employer) || !clean(w.role) || !Number(w.fromYear)) continue;
        await c.query(
          `INSERT INTO work_history (caregiver_id, employer, role, duties, from_year, to_year) VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.caregiverId, clean(w.employer), clean(w.role), clean(w.duties), Number(w.fromYear),
            w.toYear ? Number(w.toYear) : null]);
      }
      await advanceStatus(c, req.caregiverId, 'details_submitted');
    });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'caregivers_identity_uq') {
      return res.status(409).json({ error: 'This ID number is already registered to another account' });
    }
    throw err;
  }
  res.json({ message: 'Details saved' });
}));

// PUT /caregivers/me/specialties  { specializations, technicalSkills, languages, availability }
router.put('/caregivers/me/specialties', requireAuth, wrap(async (req, res) => {
  const b = req.body || {};
  const groups = [['specialization', b.specializations], ['technical', b.technicalSkills], ['language', b.languages]];
  const unknownShifts = [];
  await db.transaction(async (c) => {
    await c.query('DELETE FROM caregiver_skills WHERE caregiver_id = $1', [req.caregiverId]);
    for (const [category, names] of groups) {
      for (const raw of Array.isArray(names) ? names : []) {
        const label = clean(raw);
        if (!label) continue;
        const name = SKILL_ALIASES[label.toLowerCase()] || label;
        // reuse an existing tag with that name (any category); otherwise add a custom tag
        let { rows } = await c.query('SELECT skill_tag_id FROM skill_tags WHERE lower(skill_name) = lower($1) LIMIT 1', [name]);
        if (!rows[0]) {
          ({ rows } = await c.query(
            `INSERT INTO skill_tags (skill_name, category, description) VALUES ($1, $2, 'Added by a caregiver')
             RETURNING skill_tag_id`, [name, category]));
        }
        await c.query(
          `INSERT INTO caregiver_skills (caregiver_id, skill_tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [req.caregiverId, rows[0].skill_tag_id]);
      }
    }
    await c.query('DELETE FROM caregiver_availability WHERE caregiver_id = $1', [req.caregiverId]);
    for (const raw of Array.isArray(b.availability) ? b.availability : []) {
      const shifts = SHIFT_MAP[String(raw).trim().toLowerCase()];
      if (!shifts) { unknownShifts.push(raw); continue; }
      for (const shift of shifts) for (let day = 0; day < 7; day++) {
        await c.query(
          'INSERT INTO caregiver_availability (caregiver_id, day_of_week, shift) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [req.caregiverId, day, shift]);
      }
    }
  });
  res.json({ message: 'Specialties saved', ...(unknownShifts.length && { ignoredAvailability: unknownShifts }) });
}));

module.exports = router;
