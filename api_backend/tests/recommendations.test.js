/**
 * Endpoint tests for /recommendations against your real database.
 *
 *   cd api_backend
 *   node --test tests/recommendations.test.js
 *
 * Creates its own skill tags, category, jobs and caregivers (all names start with
 * "zz-test") and deletes them at the end, so seeded data is untouched.
 */
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { signToken } = require('../middleware/auth');

let api; let server; let db;
const tag = crypto.randomBytes(3).toString('hex');
const ids = { tags: {}, jobs: {}, caregivers: [] };

async function q(text, params) { return (await db.query(text, params)).rows; }

async function makeCaregiver({ status = 'verified', county = 'Nairobi', exp = 4, shifts = ['morning'], skills = [] }) {
  const [c] = await q(
    `INSERT INTO caregivers (first_name, last_name, email, password_hash, county, experience_years, onboarding_status)
     VALUES ('Test', 'Caregiver', $1, 'x', $2, $3, $4) RETURNING caregiver_id`,
    [`zz-test.${tag}.${ids.caregivers.length}@example.com`, county, exp, status]);
  ids.caregivers.push(c.caregiver_id);
  for (const s of shifts) {
    await q('INSERT INTO caregiver_availability (caregiver_id, day_of_week, shift) VALUES ($1, 1, $2)', [c.caregiver_id, s]);
  }
  for (const s of skills) {
    await q('INSERT INTO caregiver_skills (caregiver_id, skill_tag_id, proficiency_level) VALUES ($1, $2, 3)',
      [c.caregiver_id, ids.tags[s]]);
  }
  return { id: c.caregiver_id, token: signToken(c.caregiver_id) };
}

async function makeJob(key, { county = 'Nairobi', shift = 'morning', minExp = 2, status = 'open', reqs = [] }) {
  const [j] = await q(
    `INSERT INTO job_postings (title, category_id, county, shift, min_experience_years, status, salary_min_kes, salary_max_kes)
     VALUES ($1, $2, $3, $4, $5, $6, 20000, 30000) RETURNING job_id`,
    [`zz-test ${tag} ${key}`, ids.category, county, shift, minExp, status]);
  for (const s of reqs) {
    await q('INSERT INTO job_skill_requirements (job_id, skill_tag_id, importance) VALUES ($1, $2, 1)', [j.job_id, ids.tags[s]]);
  }
  ids.jobs[key] = j.job_id;
}

const call = (method, url, token) => fetch(api + url, {
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
});

test.before(async () => {
  db = require('../db');
  for (const s of ['wound', 'meds', 'elderly', 'child']) {
    const [t] = await q(`INSERT INTO skill_tags (skill_name, category) VALUES ($1, 'technical') RETURNING skill_tag_id`,
      [`zz-test ${tag} ${s}`]);
    ids.tags[s] = t.skill_tag_id;
  }
  const [cat] = await q(`INSERT INTO job_categories (name) VALUES ($1) RETURNING category_id`, [`zz-test ${tag}`]);
  ids.category = cat.category_id;

  await makeJob('best', { reqs: ['wound', 'meds'] });
  await makeJob('half', { reqs: ['wound', 'elderly'] });
  await makeJob('unrelated', { reqs: ['child'] });
  await makeJob('other-county', { county: 'Kisumu', reqs: ['wound', 'meds'] });
  await makeJob('night', { shift: 'night', reqs: ['wound', 'meds'] });
  await makeJob('senior', { minExp: 10, reqs: ['wound', 'meds'] });
  await makeJob('filled', { status: 'filled', reqs: ['wound', 'meds'] });

  const app = require('../app');
  server = app.listen(0);
  api = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await q('DELETE FROM caregivers WHERE caregiver_id = ANY($1)', [ids.caregivers]);
  await q('DELETE FROM job_postings WHERE job_id = ANY($1)', [Object.values(ids.jobs)]);
  await q('DELETE FROM job_categories WHERE category_id = $1', [ids.category]);
  await q('DELETE FROM skill_tags WHERE skill_tag_id = ANY($1)', [Object.values(ids.tags)]);
  await db.pool.end();
  server.close();
});

const mine = (matches) => matches.filter((m) => m.title.startsWith(`zz-test ${tag}`));

test('requires a token', async () => {
  assert.equal((await fetch(`${api}/recommendations`)).status, 401);
});

test('a caregiver who is not verified gets 403 not_verified', async () => {
  const c = await makeCaregiver({ status: 'under_review', skills: ['wound'] });
  const r = await call('GET', '/recommendations', c.token);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).reason, 'not_verified');
});

test('ranked matches respect every hard filter and explain themselves', async () => {
  const c = await makeCaregiver({ skills: ['wound', 'meds'] });
  const r = await call('GET', '/recommendations?limit=50', c.token);
  assert.equal(r.status, 200);
  const list = mine((await r.json()).matches);
  assert.deepEqual(list.map((m) => m.title.split(' ').pop()), ['best', 'half'],
    'other county, night shift, too senior, filled and unrelated jobs are excluded');
  assert.equal(list[0].matchPercent, 100);
  assert.deepEqual(list[1].missingSkills, [`zz-test ${tag} elderly`]);
  assert.ok(list[0].reasons.length >= 3);

  const vec = await q('SELECT vocab_version FROM caregiver_skill_vectors WHERE caregiver_id = $1', [c.id]);
  assert.equal(vec.length, 1, 'SkillVector stored');
  const stored = await q('SELECT rank, status FROM job_matches WHERE caregiver_id = $1 AND job_id = $2', [c.id, ids.jobs.best]);
  assert.equal(stored[0].status, 'suggested');
});

test('express interest, list interests, and interest survives a refresh', async () => {
  const c = await makeCaregiver({ skills: ['wound', 'meds'] });
  await call('GET', '/recommendations', c.token);
  let r = await call('POST', `/recommendations/${ids.jobs.half}/interest`, c.token);
  assert.equal(r.status, 201);
  assert.equal((await r.json()).status, 'interested');

  r = await call('GET', '/recommendations/interests', c.token);
  const { interests } = await r.json();
  assert.deepEqual(interests.map((i) => i.jobId), [ids.jobs.half]);
  assert.deepEqual(interests[0].missingSkills, [`zz-test ${tag} elderly`]);

  const again = mine((await (await call('GET', '/recommendations?limit=50', c.token)).json()).matches);
  assert.equal(again.find((m) => m.jobId === ids.jobs.half).status, 'interested', 'refresh keeps interest');
});

test('interest is refused for closed, non-matching or unknown jobs', async () => {
  const c = await makeCaregiver({ skills: ['wound', 'meds'] });
  assert.equal((await call('POST', `/recommendations/${ids.jobs.filled}/interest`, c.token)).status, 409);
  assert.equal((await call('POST', `/recommendations/${ids.jobs['other-county']}/interest`, c.token)).status, 409);
  assert.equal((await call('POST', `/recommendations/${crypto.randomUUID()}/interest`, c.token)).status, 404);
});

test('weighted method is accepted', async () => {
  const c = await makeCaregiver({ skills: ['wound', 'meds'] });
  const body = await (await call('GET', '/recommendations?method=weighted', c.token)).json();
  assert.equal(body.method, 'weighted');
});
