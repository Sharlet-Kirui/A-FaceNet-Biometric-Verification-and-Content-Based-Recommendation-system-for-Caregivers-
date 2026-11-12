// /caregivers/me: profile, Details screen and Specialties screen. /skill-tags: vocabulary.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { encryptId, decryptId, hashId } = require('../services/idCrypto');
const { advanceStatus } = require('../services/onboarding');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const GENDERS = { 'female': 'female', 'male': 'male', 'other': 'other', 'prefer not to say': 'prefer_not_to_say',
  'prefer_not_to_say': 'prefer_not_to_say' };
const ID_TYPES = { 'national id': 'national_id', 'national_id': 'national_id', 'passport': 'passport' };
// Once the selfie step has run, identity fields are what was verified: changing them would
// invalidate the decision, so they can only change through a new application.
const IDENTITY_LOCKED = ['liveness_done', 'under_review', 'verified'];

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
            id_number_encrypted, street, town, county, postal_code, country, experience_years, onboarding_status, email_verified_at
       FROM caregivers WHERE caregiver_id = $1`, [req.caregiverId]);
  if (!rows[0]) return res.status(404).json({ error: 'Caregiver not found' });
  const { id_number_encrypted: enc, ...me } = rows[0];
  let idNumber = null;
  try { idNumber = enc ? decryptId(enc) : null; } catch { idNumber = null; }
  const [skills, trust, credentials, work, shifts] = await Promise.all([
    db.query(`SELECT t.skill_name, t.category, cs.proficiency_level FROM caregiver_skills cs
                JOIN skill_tags t USING (skill_tag_id) WHERE cs.caregiver_id = $1 ORDER BY t.category, t.skill_name`, [req.caregiverId]),
    db.query('SELECT score, is_verified FROM trust_scores WHERE caregiver_id = $1', [req.caregiverId]),
    db.query(`SELECT credential_type, reference_number, issuing_authority, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date, status
                FROM caregiver_credentials WHERE caregiver_id = $1`, [req.caregiverId]),
    db.query(`SELECT employer, role, duties, from_year, to_year FROM work_history WHERE caregiver_id = $1
               ORDER BY from_year DESC`, [req.caregiverId]),
    db.query('SELECT DISTINCT shift FROM caregiver_availability WHERE caregiver_id = $1', [req.caregiverId]),
  ]);
  res.json({
    ...me,
    id_number: idNumber, // the caregiver's own number, for the edit screen
    identity_locked: IDENTITY_LOCKED.includes(me.onboarding_status),
    skills: skills.rows,
    trust: trust.rows[0] || null,
    credentials: credentials.rows,
    work_history: work.rows,
    shifts: shifts.rows.map((r) => r.shift),
  });
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
  const experience = Number(b.experienceYears);
  if (!Number.isInteger(experience) || experience < 0 || experience > 60) errors.experienceYears = 'whole years, 0-60';
  // Certificate of Good Conduct: compulsory for household work
  const pc = b.policeClearance || {};
  if (!clean(pc.referenceNumber)) errors.policeClearance = 'certificate of good conduct reference number is required';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(pc.expiryDate || '')) errors.policeClearance = 'expiry date (YYYY-MM-DD) is required';
  else if (new Date(pc.expiryDate) <= new Date()) errors.policeClearance = 'the certificate has expired: renew it on eCitizen';
  // Work history: at least one entry when the caregiver reports experience
  const work = (Array.isArray(b.workHistory) ? b.workHistory : [])
    .filter((w) => clean(w.employer) && clean(w.role) && Number(w.fromYear));
  if (Number.isInteger(experience) && experience > 0 && work.length === 0) {
    errors.workHistory = 'add at least one previous job (you reported experience)';
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Validation failed', fields: errors });

  const nationality = clean(b.nationality);
  const current = (await db.query(
    `SELECT onboarding_status, to_char(date_of_birth, 'YYYY-MM-DD') AS dob, id_type, nationality, id_number_hash
       FROM caregivers WHERE caregiver_id = $1`, [req.caregiverId])).rows[0];
  if (current && IDENTITY_LOCKED.includes(current.onboarding_status)) {
    const changed = current.dob !== b.dateOfBirth || current.id_type !== idType || current.nationality !== nationality
      || current.id_number_hash !== hashId(idType, nationality, idNumber);
    if (changed) {
      return res.status(409).json({
        error: 'Your date of birth, nationality and ID cannot be changed after verification. Contact support if they are wrong.',
        reason: 'identity_locked' });
    }
  }
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
          experience]);

      for (const [key, type] of [['policeClearance', 'police_clearance'], ['professionalLicense', 'professional_license']]) {
        const cr = b[key] || {};
        const ref = clean(cr.referenceNumber ?? cr.licenseNumber);
        const old = (await c.query(
          'SELECT reference_number, status FROM caregiver_credentials WHERE caregiver_id = $1 AND credential_type = $2',
          [req.caregiverId, type])).rows[0];
        await c.query('DELETE FROM caregiver_credentials WHERE caregiver_id = $1 AND credential_type = $2', [req.caregiverId, type]);
        if (ref) {
          // an unchanged reference keeps the status an administrator gave it
          const status = old && old.reference_number === ref ? old.status : 'pending';
          await c.query(
            `INSERT INTO caregiver_credentials (caregiver_id, credential_type, reference_number, issuing_authority, expiry_date, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [req.caregiverId, type, ref, clean(cr.issuingAuthority), clean(cr.expiryDate), status]);
        }
      }

      await c.query('DELETE FROM work_history WHERE caregiver_id = $1', [req.caregiverId]);
      for (const w of work) {
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

// PUT /caregivers/me/specialties  { specializations, technicalSkills, languages, certifications, availability }
router.put('/caregivers/me/specialties', requireAuth, wrap(async (req, res) => {
  const b = req.body || {};
  const groups = [['specialization', b.specializations], ['technical', b.technicalSkills], ['language', b.languages],
    ['certification', b.certifications]];
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
