// Run from api_backend:  node --test services/recommender.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('./recommender');

const vocab = r.buildVocabulary([
  { skill_tag_id: 'wound', skill_name: 'Wound Dressing', category: 'technical' },
  { skill_tag_id: 'meds', skill_name: 'Medication Administration', category: 'technical' },
  { skill_tag_id: 'elderly', skill_name: 'Elderly Care', category: 'specialization' },
  { skill_tag_id: 'kis', skill_name: 'Kiswahili', category: 'language' },
]);

const caregiver = (over = {}) => ({
  caregiver_id: 'cg', onboarding_status: 'verified', county: 'Nairobi', experience_years: 4,
  shifts: new Set(['morning']),
  skills: [
    { skill_tag_id: 'wound', proficiency_level: 5 },
    { skill_tag_id: 'meds', proficiency_level: 2 },
    { skill_tag_id: 'kis', proficiency_level: 4 },
  ],
  ...over,
});
const job = (id, reqs, over = {}) => ({
  job_id: id, status: 'open', county: 'Nairobi', min_experience_years: 2, shift: 'morning',
  created_at: '2026-11-01', requirements: reqs.map(([sid, importance = 1]) => ({ skill_tag_id: sid, importance })),
  ...over,
});

// ---------------------------------------------------------------- vectors and cosine
test('binary and weighted caregiver vectors follow the vocabulary order', () => {
  assert.deepEqual(r.caregiverVector(caregiver().skills, vocab, 'binary'), [1, 1, 0, 1]);
  assert.deepEqual(r.caregiverVector(caregiver().skills, vocab, 'weighted'), [1, 0.4, 0, 0.8]);
});

test('job vectors: 1 per requirement (binary) or its importance (weighted)', () => {
  const reqs = job('j', [['wound', 0.5], ['elderly', 1]]).requirements;
  assert.deepEqual(r.jobVector(reqs, vocab, 'binary'), [1, 0, 1, 0]);
  assert.deepEqual(r.jobVector(reqs, vocab, 'weighted'), [0.5, 0, 1, 0]);
});

test('skills outside the vocabulary are ignored', () => {
  assert.deepEqual(r.caregiverVector([{ skill_tag_id: 'unknown' }], vocab), [0, 0, 0, 0]);
});

test('cosine: identical = 1, disjoint = 0, empty vector = 0 (no division by zero)', () => {
  assert.ok(Math.abs(r.cosine([1, 0, 1], [1, 0, 1]) - 1) < 1e-12);
  assert.equal(r.cosine([1, 0, 0], [0, 1, 0]), 0);
  assert.equal(r.cosine([0, 0, 0], [1, 1, 0]), 0);
  assert.ok(Math.abs(r.cosine([1, 1, 0], [1, 0, 0]) - Math.SQRT1_2) < 1e-12);
});

test('keyword baseline counts shared tags', () => {
  assert.equal(r.sharedTagCount(caregiver().skills, job('j', [['wound'], ['elderly'], ['kis']]).requirements), 2);
});

// ---------------------------------------------------------------- hard filters
test('every hard filter excludes a job on its own', () => {
  const ok = job('j', [['wound']]);
  assert.equal(r.hardFilters(caregiver(), ok).pass, true);
  const cases = {
    verified: [caregiver({ onboarding_status: 'under_review' }), ok],
    open: [caregiver(), { ...ok, status: 'filled' }],
    county: [caregiver(), { ...ok, county: 'Mombasa' }],
    experience: [caregiver({ experience_years: 1 }), ok],
    shift: [caregiver(), { ...ok, shift: 'night' }],
  };
  for (const [name, [c, j]] of Object.entries(cases)) {
    const f = r.hardFilters(c, j);
    assert.equal(f.pass, false, name);
    assert.equal(f.checks[name], false, name);
  }
});

test('county comparison ignores case and spaces', () => {
  assert.equal(r.hardFilters(caregiver({ county: ' nairobi ' }), job('j', [['wound']])).pass, true);
});

// ---------------------------------------------------------------- ranking
test('jobs are ranked by cosine; failing or zero-score jobs are left out', () => {
  const jobs = [
    job('half', [['wound'], ['elderly']]),
    job('best', [['wound'], ['meds'], ['kis']]),
    job('none', [['elderly']]),
    job('other-county', [['wound'], ['meds'], ['kis']], { county: 'Kisumu' }),
  ];
  const ranked = r.rankJobs(caregiver(), jobs, vocab);
  assert.deepEqual(ranked.map((m) => m.job.job_id), ['best', 'half']);
  assert.deepEqual(ranked.map((m) => m.rank), [1, 2]);
  assert.equal(ranked[0].score, 1);
});

test('held and missing skills and reasons are reported', () => {
  const m = r.scoreJob(caregiver(), job('j', [['wound'], ['elderly']]), vocab);
  assert.deepEqual(m.held, ['Wound Dressing']);
  assert.deepEqual(m.missing, ['Elderly Care']);
  assert.ok(m.reasons[0].includes('1 of 2'));
  assert.ok(m.reasons.some((x) => x.includes('Morning')));
});

test('weighted variant favours the skills a job marks as more important', () => {
  const important = job('important', [['wound', 1], ['elderly', 0.2]]);
  const minor = job('minor', [['wound', 0.2], ['elderly', 1]]);
  const [first] = r.rankJobs(caregiver(), [minor, important], vocab, { method: 'weighted' });
  assert.equal(first.job.job_id, 'important');
  // binary scores both the same (one of two skills held)
  const binary = r.rankJobs(caregiver(), [minor, important], vocab, { method: 'binary' });
  assert.equal(binary[0].score, binary[1].score);
});

test('ties: more held skills first, then the newer job', () => {
  const older = job('older', [['wound']], { created_at: '2026-01-01' });
  const newer = job('newer', [['wound']], { created_at: '2026-11-01' });
  assert.deepEqual(r.rankJobs(caregiver(), [older, newer], vocab).map((m) => m.job.job_id), ['newer', 'older']);
});

test('ignoreFilters scores a job that fails a filter (used by the evaluation ablation)', () => {
  const j = job('far', [['wound']], { county: 'Kisumu' });
  assert.equal(r.scoreJob(caregiver(), j, vocab), null);
  assert.equal(r.scoreJob(caregiver(), j, vocab, { ignoreFilters: true }).score > 0, true);
});
