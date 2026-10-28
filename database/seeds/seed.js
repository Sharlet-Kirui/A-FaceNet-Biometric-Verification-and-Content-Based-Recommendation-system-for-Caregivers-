/**
 * Synthetic seed data for the caregiver system (M2).
 *
 *   200 caregivers (+ skills, availability, credentials, work history, KYC,
 *   reports, trust scores) and 100 job postings with weighted skill
 *   requirements. Also writes ground_truth.json for Precision@K evaluation.
 *
 * Run from the repo root:
 *     node database/seeds/seed.js
 *
 * Dependencies are resolved from api_backend/node_modules:
 *     cd api_backend && npm install pg @faker-js/faker bcryptjs dotenv
 * DATABASE_URL is read from api_backend/.env.
 *
 * Synthetic data only. No real people, no real ID numbers. Face embeddings are
 * NOT seeded because random vectors would be meaningless; the ML service
 * writes those.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createRequire } = require('module');

const backendPkg = path.resolve(__dirname, '../../api_backend/package.json');
const req = createRequire(backendPkg);
req('dotenv').config({ path: path.resolve(__dirname, '../../api_backend/.env') });
const { Client } = req('pg');
const { faker } = req('@faker-js/faker');
const bcrypt = req('bcryptjs');

const N_CAREGIVERS = 200;
const N_JOBS = 100;
const DEV_PASSWORD = 'Password123!'; // every seeded account uses this

faker.seed(2026); // deterministic: same data every run

// Dev-only keys. Real keys come from environment variables in production.
// Any string works: the 32-byte AES key is derived with SHA-256, so a wrong-length
// ID_ENC_KEY can no longer crash the seed. The backend helper must use the same derivation.
const ENC_KEY = crypto.createHash('sha256').update(process.env.ID_ENC_KEY || 'dev-enc-key').digest();
const HMAC_KEY = process.env.ID_HMAC_KEY || 'dev-hmac-key';

function encryptId(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}
const hashId = (plain) => crypto.createHmac('sha256', HMAC_KEY).update(plain).digest('hex');

// ---------------------------------------------------------------- vocab
const SKILLS = {
  specialization: [
    'Elderly Care', 'Child & Newborn Care', 'Post-Surgery Recovery',
    "Dementia & Alzheimer's Care", 'Palliative Care', 'Disability Support',
    'Postnatal Care', 'Physiotherapy Assistance',
  ],
  technical: [
    'Wound Dressing', 'Medication Administration', 'Vital Signs Monitoring',
    'CPR & First Aid', 'Catheter Care', 'Injection Administration',
    'Patient Mobility & Transfer', 'Nutrition & Feeding Assistance',
    'Diabetic Care', 'Stoma Care',
  ],
  language: ['English', 'Kiswahili', 'Kikuyu', 'Luo', 'Kalenjin', 'Kamba', 'Luhya', 'Somali'],
  certification: ['CPR Certified', 'TVET CDACC Level 5', 'NITA Certified', 'Nursing Council Licence'],
};

// Technical skills typically held by each specialization (makes synthetic profiles cluster realistically)
const TECH_BY_SPEC = {
  'Elderly Care': ['Vital Signs Monitoring', 'Medication Administration', 'Patient Mobility & Transfer', 'Nutrition & Feeding Assistance', 'Diabetic Care'],
  'Child & Newborn Care': ['CPR & First Aid', 'Nutrition & Feeding Assistance', 'Vital Signs Monitoring'],
  'Post-Surgery Recovery': ['Wound Dressing', 'Medication Administration', 'Injection Administration', 'Catheter Care', 'Vital Signs Monitoring'],
  "Dementia & Alzheimer's Care": ['Medication Administration', 'Patient Mobility & Transfer', 'Nutrition & Feeding Assistance'],
  'Palliative Care': ['Medication Administration', 'Stoma Care', 'Catheter Care', 'Vital Signs Monitoring'],
  'Disability Support': ['Patient Mobility & Transfer', 'Nutrition & Feeding Assistance', 'CPR & First Aid'],
  'Postnatal Care': ['CPR & First Aid', 'Nutrition & Feeding Assistance', 'Vital Signs Monitoring'],
  'Physiotherapy Assistance': ['Patient Mobility & Transfer', 'Vital Signs Monitoring', 'Wound Dressing'],
};

// category -> specializations that typically serve it
const CATEGORIES = [
  ['Elderly Care', ['Elderly Care', "Dementia & Alzheimer's Care"]],
  ['Child & Newborn Care', ['Child & Newborn Care', 'Postnatal Care']],
  ['Post-Operative Care', ['Post-Surgery Recovery', 'Physiotherapy Assistance']],
  ['Chronic Illness Care', ['Elderly Care', 'Post-Surgery Recovery']],
  ['Disability Support', ['Disability Support', 'Physiotherapy Assistance']],
  ['Palliative Care', ['Palliative Care', 'Elderly Care']],
];

const COUNTIES = [
  ['Nairobi', 0.38], ['Kiambu', 0.14], ['Mombasa', 0.10], ['Nakuru', 0.09],
  ['Kisumu', 0.08], ['Uasin Gishu', 0.07], ['Machakos', 0.06], ['Kajiado', 0.05], ['Nyeri', 0.03],
];
const TOWNS = {
  Nairobi: ['Kilimani', 'Westlands', 'Embakasi', 'Karen', 'Kasarani', 'Langata'],
  Kiambu: ['Thika', 'Ruiru', 'Kikuyu', 'Limuru'], Mombasa: ['Nyali', 'Likoni', 'Tudor'],
  Nakuru: ['Nakuru Town', 'Naivasha'], Kisumu: ['Milimani', 'Kondele'],
  'Uasin Gishu': ['Eldoret', 'Langas'], Machakos: ['Athi River', 'Machakos Town'],
  Kajiado: ['Ongata Rongai', 'Kitengela'], Nyeri: ['Nyeri Town', 'Karatina'],
};
const SHIFTS = ['morning', 'afternoon', 'night', 'live_in'];

const FIRST = ['Mary', 'Grace', 'Faith', 'Joyce', 'Esther', 'Lucy', 'Mercy', 'Naomi', 'Rose', 'Winnie',
  'Beatrice', 'Caroline', 'Dorcas', 'Hellen', 'Purity', 'Ruth', 'Susan', 'Terry', 'Agnes', 'Lilian',
  'Brian', 'Kevin', 'Peter', 'John', 'James', 'Samuel', 'Daniel', 'Collins', 'Dennis', 'Victor'];
const LAST = ['Wanjiku', 'Otieno', 'Kamau', 'Njeri', 'Achieng', 'Mutua', 'Kiplagat', 'Chebet', 'Wafula',
  'Mwangi', 'Odhiambo', 'Kariuki', 'Atieno', 'Kimani', 'Naliaka', 'Cheruiyot', 'Muthoni', 'Omondi',
  'Wambui', 'Kipchoge', 'Nyambura', 'Barasa', 'Mbugua', 'Akinyi', 'Maina'];

const EMPLOYERS = ['Nairobi Home Care Ltd', 'Sunrise Elderly Home', 'Kenyatta Hospital (contract)',
  'Little Angels Daycare', 'Mombasa Care Givers', 'Private household', 'Aga Khan Home Nursing',
  'Karen Hospital (attachment)', 'St. Mary\'s Mission Home', 'Lifeline Community Health'];
const ROLES = ['Home Care Assistant', 'Nanny', 'Nursing Aide', 'Elderly Companion', 'Community Health Volunteer'];

// ---------------------------------------------------------------- helpers
const pick = (arr) => arr[faker.number.int({ min: 0, max: arr.length - 1 })];
const pickMany = (arr, n) => faker.helpers.arrayElements(arr, n);
function weightedCounty() {
  let r = faker.number.float({ min: 0, max: 1 });
  for (const [c, w] of COUNTIES) { if ((r -= w) <= 0) return c; }
  return COUNTIES[0][0];
}
const between = (a, b) => faker.number.int({ min: a, max: b });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ---------------------------------------------------------------- main
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing (api_backend/.env)');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const q = (text, params) => db.query(text, params);

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 8);

  try {
    await q('BEGIN');
    await q(`TRUNCATE job_matches, job_skill_requirements, job_postings, job_categories,
             audit_logs, trust_scores, verification_reports, face_embeddings, kyc_documents,
             kyc_submissions, work_history, caregiver_credentials, caregiver_availability,
             caregiver_skills, caregiver_skill_vectors, email_otps, skill_tags, caregivers, admins CASCADE`);

    // ---- skill tags
    const tagId = {}; // `${category}:${name}` -> uuid
    for (const [category, names] of Object.entries(SKILLS)) {
      for (const name of names) {
        const r = await q(
          'INSERT INTO skill_tags (skill_name, category) VALUES ($1,$2) RETURNING skill_tag_id', [name, category]);
        tagId[`${category}:${name}`] = r.rows[0].skill_tag_id;
      }
    }

    // ---- job categories
    const categoryId = {};
    for (const [name] of CATEGORIES) {
      const r = await q('INSERT INTO job_categories (name, description) VALUES ($1,$2) RETURNING category_id',
        [name, `${name} placements for home-care families`]);
      categoryId[name] = r.rows[0].category_id;
    }

    // ---- admins
    const adminIds = [];
    for (const [fn, ln, role] of [['Esther', 'Admin', 'super_admin'], ['Review', 'Officer', 'reviewer']]) {
      const r = await q(
        `INSERT INTO admins (first_name,last_name,email,password_hash,role_level)
         VALUES ($1,$2,$3,$4,$5) RETURNING admin_id`,
        [fn, ln, `${fn}.${ln}@caregiver.test`.toLowerCase(), passwordHash, role]);
      adminIds.push(r.rows[0].admin_id);
    }

    // ---- caregivers
    const caregivers = []; // in-memory profile for job generation + ground truth
    const usedIds = new Set();

    for (let i = 0; i < N_CAREGIVERS; i++) {
      const first = pick(FIRST), last = pick(LAST);
      const county = weightedCounty();
      const gender = first.match(/^(Brian|Kevin|Peter|John|James|Samuel|Daniel|Collins|Dennis|Victor)$/)
        ? 'male' : faker.helpers.weightedArrayElement([
          { value: 'female', weight: 92 }, { value: 'other', weight: 1 }, { value: 'prefer_not_to_say', weight: 7 }]);
      const national = faker.number.float({ min: 0, max: 1 }) < 0.93;
      const idType = national ? 'national_id' : 'passport';
      const nationality = national ? 'Kenyan' : pick(['Ugandan', 'Tanzanian', 'Rwandan', 'Ethiopian']);
      let idNumber;
      do {
        idNumber = national ? String(between(10000000, 39999999)) : 'A' + String(between(1000000, 9999999));
      } while (usedIds.has(idNumber));
      usedIds.add(idNumber);

      // Funnel: most verified, some mid-onboarding, a few rejected
      const roll = faker.number.float({ min: 0, max: 1 });
      const status = roll < 0.70 ? 'verified' : roll < 0.78 ? 'rejected'
        : roll < 0.86 ? 'under_review' : roll < 0.92 ? 'documents_uploaded' : 'email_verified';

      const experience = between(0, 20);
      const dob = faker.date.birthdate({ min: 22, max: 60, mode: 'age' });
      const createdAt = faker.date.recent({ days: 120 });

      const email = `${slug(first)}.${slug(last)}${i}@example.com`;
      const res = await q(
        `INSERT INTO caregivers (first_name,last_name,email,password_hash,email_verified_at,phone,date_of_birth,
           gender,nationality,id_type,id_number_encrypted,id_number_hash,street,town,county,postal_code,
           country,experience_years,onboarding_status,biometric_consent_at,iprs_consent_at,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'Kenya',$17,$18,$19,$20,$21)
         RETURNING caregiver_id`,
        [first, last, email, passwordHash, createdAt, '+2547' + String(between(10000000, 99999999)), dob,
          gender, nationality, idType, encryptId(idNumber), hashId(`${idType}|${nationality}|${idNumber}`),
          faker.location.street(), pick(TOWNS[county]), county, String(between(100, 90000)),
          experience, status,
          status === 'email_verified' ? null : createdAt, status === 'email_verified' ? null : createdAt, createdAt]);
      const id = res.rows[0].caregiver_id;

      // Skills: skills correlate with a "primary" specialization so matching is meaningful
      const specs = pickMany(SKILLS.specialization, between(1, 2));
      const cluster = [...new Set(specs.flatMap((sp) => TECH_BY_SPEC[sp]))];
      const techs = [...new Set([...pickMany(cluster, Math.min(cluster.length, between(2, 4))),
        ...pickMany(SKILLS.technical, between(0, 1))])];
      const langs = ['English', ...(faker.number.float({ min: 0, max: 1 }) < 0.95 ? ['Kiswahili'] : []),
        ...pickMany(SKILLS.language.slice(2), between(0, 2))];
      const certs = pickMany(SKILLS.certification, between(0, 2));
      const skillRows = [
        ...specs.map((n) => ['specialization', n]), ...techs.map((n) => ['technical', n]),
        ...[...new Set(langs)].map((n) => ['language', n]), ...certs.map((n) => ['certification', n]),
      ];
      const profSkills = [];
      for (const [cat, name] of skillRows) {
        const prof = Math.min(5, Math.max(1, Math.round(1 + experience / 5 + faker.number.float({ min: -1, max: 1.5 }))));
        await q('INSERT INTO caregiver_skills (caregiver_id,skill_tag_id,proficiency_level,verified) VALUES ($1,$2,$3,$4)',
          [id, tagId[`${cat}:${name}`], prof, status === 'verified']);
        profSkills.push({ cat, name, prof });
      }

      // Availability: 3-6 days, one or two shifts
      const days = pickMany([0, 1, 2, 3, 4, 5, 6], between(3, 6));
      const shifts = pickMany(SHIFTS, between(1, 2));
      const availability = new Set();
      for (const d of days) for (const s of shifts) {
        await q('INSERT INTO caregiver_availability (caregiver_id,day_of_week,shift) VALUES ($1,$2,$3)', [id, d, s]);
        availability.add(`${d}|${s}`);
      }

      // Credentials
      const credRows = [['police_clearance', 'Directorate of Criminal Investigations']];
      if (certs.includes('Nursing Council Licence')) credRows.push(['professional_license', 'Nursing Council of Kenya']);
      if (certs.some((c) => c.startsWith('TVET') || c.startsWith('NITA'))) credRows.push(['tvet_cdacc', 'TVET CDACC']);
      for (const [type, authority] of credRows) {
        const expiry = faker.date.between({ from: new Date(Date.now() - 30 * 864e5), to: new Date(Date.now() + 700 * 864e5) });
        const credStatus = status === 'verified' ? (expiry < new Date() ? 'expired' : 'verified') : 'pending';
        await q(`INSERT INTO caregiver_credentials (caregiver_id,credential_type,reference_number,issuing_authority,expiry_date,status)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, type, 'REF-' + faker.string.alphanumeric({ length: 8, casing: 'upper' }), authority, expiry, credStatus]);
      }

      // Work history
      const nWork = experience === 0 ? 0 : between(1, 3);
      let year = new Date().getFullYear();
      for (let w = 0; w < nWork; w++) {
        const toYear = w === 0 && faker.number.float({ min: 0, max: 1 }) < 0.5 ? null : year;
        const fromYear = Math.max(1990, year - between(1, 5));
        await q(`INSERT INTO work_history (caregiver_id,employer,role,duties,from_year,to_year) VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, pick(EMPLOYERS), pick(ROLES), faker.lorem.sentence(), fromYear, toYear]);
        year = fromYear - 1;
      }

      // KYC + report + trust score for caregivers past the documents step
      if (['verified', 'rejected', 'under_review', 'documents_uploaded'].includes(status)) {
        const kycStatus = { verified: 'approved', rejected: 'rejected', under_review: 'flagged', documents_uploaded: 'pending' }[status];
        const challenge = pick(['turn_left', 'turn_right']);
        const sub = await q(
          `INSERT INTO kyc_submissions (caregiver_id,attempt_number,status,biometric_consent,iprs_consent,
             liveness_nonce,liveness_challenge,liveness_issued_at,liveness_consumed_at)
           VALUES ($1,1,$2,true,true,$3,$4,$5,$5) RETURNING submission_id`,
          [id, kycStatus, crypto.randomBytes(16).toString('hex'), challenge, createdAt]);
        const subId = sub.rows[0].submission_id;

        const docTypes = [...(national ? ['id_front', 'id_back'] : ['passport']), 'good_conduct',
          'selfie_center', 'selfie_turn', 'selfie_blink'];
        if (certs.length) docTypes.push('tvet_cdacc');
        if (faker.number.float({ min: 0, max: 1 }) < 0.6) docTypes.push('cv');
        for (const t of docTypes) {
          await q(`INSERT INTO kyc_documents (caregiver_id,submission_id,doc_type,storage_url,mime_type,size_bytes)
                   VALUES ($1,$2,$3,$4,'image/jpeg',$5)`,
            [id, subId, t, `seed://caregivers/${id}/${t}.jpg`, between(80000, 4000000)]);
        }

        if (status === 'verified' || status === 'rejected' || status === 'under_review') {
          const good = status === 'verified';
          const f = (lo, hi) => Number(faker.number.float({ min: lo, max: hi }).toFixed(3));
          const match = good ? f(0.82, 0.99) : status === 'rejected' ? f(0.25, 0.60) : f(0.60, 0.80);
          const live = good ? f(0.85, 1) : status === 'rejected' ? f(0.2, 0.7) : f(0.6, 0.85);
          const ocr = good ? f(0.8, 0.98) : f(0.4, 0.8);
          const det = f(0.9, 1);
          const overall = Number((0.4 * match + 0.25 * live + 0.2 * ocr + 0.15 * det).toFixed(3));
          const rep = await q(
            `INSERT INTO verification_reports (submission_id,face_detection_score,facenet_distance,facenet_match_score,
               ocr_score,liveness_score,iprs_verification_status,overall_confidence,report_details)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING report_id`,
            [subId, det, Number((1.2 * (1 - match)).toFixed(4)), match, ocr, live,
              good ? 'verified' : status === 'rejected' ? 'mismatch' : 'unavailable', overall,
              JSON.stringify({ seeded: true, challenge })]);
          await q(
            `INSERT INTO trust_scores (report_id,caregiver_id,score,is_verified,badge_issued_at,valid_until)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [rep.rows[0].report_id, id, overall, good, good ? createdAt : null,
              good ? new Date(createdAt.getTime() + 365 * 864e5) : null]);
        }
      }

      caregivers.push({ id, county, experience, status, availability, skills: profSkills,
        skillSet: new Map(profSkills.map((s) => [`${s.cat}:${s.name}`, s.prof])) });
    }

    // ---- jobs: each job is built around a real verified caregiver (planted ideal match)
    const verified = caregivers.filter((c) => c.status === 'verified');
    const groundTruth = {};
    let jobCount = 0;

    for (let j = 0; j < N_JOBS; j++) {
      const ideal = pick(verified);
      // choose a category compatible with the ideal caregiver's specialization
      const specNames = ideal.skills.filter((s) => s.cat === 'specialization').map((s) => s.name);
      const matching = CATEGORIES.filter(([, specs]) => specs.some((s) => specNames.includes(s)));
      const [catName] = matching.length ? pick(matching) : pick(CATEGORIES);

      const [dayShift] = pickMany([...ideal.availability], 1);
      const shift = dayShift.split('|')[1];
      const minExp = Math.max(0, ideal.experience - between(0, 4));
      const salaryMin = between(15, 35) * 1000;

      // requirements: 3-6 skills the ideal caregiver actually has (never languages-only)
      const pool = ideal.skills.filter((s) => s.cat !== 'language');
      const chosen = pickMany(pool, Math.min(pool.length, between(3, 5)));
      const lang = ideal.skills.filter((s) => s.cat === 'language' && s.name !== 'English');
      if (lang.length) chosen.push(pick(lang));

      const title = `${catName.replace(' Care', '')} caregiver needed in ${ideal.county}`;
      const jr = await q(
        `INSERT INTO job_postings (title,description,category_id,county,location_detail,job_type,shift,
           min_experience_years,salary_min_kes,salary_max_kes,status,posted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11) RETURNING job_id`,
        [title, faker.lorem.paragraph(), categoryId[catName], ideal.county, pick(TOWNS[ideal.county]),
          shift === 'live_in' ? 'live_in' : pick(['full_time', 'part_time', 'temporary']), shift, minExp,
          salaryMin, salaryMin + between(5, 15) * 1000, adminIds[0]]);
      const jobId = jr.rows[0].job_id;

      const reqs = [];
      for (const s of chosen) {
        const importance = Number(faker.number.float({ min: 0.4, max: 1 }).toFixed(2));
        const reqProf = Math.max(1, s.prof - between(0, 1));
        await q('INSERT INTO job_skill_requirements (job_id,skill_tag_id,required_proficiency,importance) VALUES ($1,$2,$3,$4)',
          [jobId, tagId[`${s.cat}:${s.name}`], reqProf, importance]);
        reqs.push({ key: `${s.cat}:${s.name}`, reqProf, importance });
      }

      // Rule-based relevant set: hard filters pass + holds >= 50% of the weighted required skills
      // (presence of the skill; proficiency is left to the ranking to discriminate)
      const totalW = reqs.reduce((a, r) => a + r.importance, 0);
      const relevant = caregivers.filter((c) => {
        if (c.status !== 'verified' || c.county !== ideal.county || c.experience < minExp) return false;
        if (![...c.availability].some((a) => a.endsWith('|' + shift))) return false;
        const covered = reqs.reduce((a, r) => a + (c.skillSet.has(r.key) ? r.importance : 0), 0);
        return covered / totalW >= 0.5;
      }).map((c) => c.id);

      groundTruth[jobId] = { planted: ideal.id, relevant: [...new Set([ideal.id, ...relevant])] };
      jobCount++;
    }

    await q('COMMIT');

    fs.writeFileSync(path.resolve(__dirname, 'ground_truth.json'), JSON.stringify(groundTruth, null, 2));
    console.log(`Seeded ${N_CAREGIVERS} caregivers (${verified.length} verified), ${jobCount} jobs, ` +
      `${Object.keys(SKILLS).reduce((a, k) => a + SKILLS[k].length, 0)} skill tags.`);
    const avgRel = Object.values(groundTruth).reduce((a, g) => a + g.relevant.length, 0) / jobCount;
    console.log(`ground_truth.json written (avg ${avgRel.toFixed(1)} relevant caregivers per job).`);
    console.log(`All seeded logins use password: ${DEV_PASSWORD}`);
  } catch (err) {
    await q('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });