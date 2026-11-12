/**
 * Recommender evaluation for Chapter 5 (proposal 3.2.4: Precision@K and MAP
 * against a keyword baseline).
 *
 * Run from the repo root after seeding (the ground truth belongs to that seed):
 *     node database/seeds/seed.js
 *     node ml_eval/evaluate_recommender.js
 *     node ml_eval/evaluate_recommender.js --no-filters    (ablation: hard filters off)
 *
 * Ground truth: database/seeds/ground_truth.json lists, for every seeded job, the
 * caregivers that are relevant to it (the planted caregiver the job was built around,
 * plus every verified caregiver who passes the job's filters and holds at least 50%
 * of its weighted required skills). It is inverted here to caregiver -> relevant jobs.
 *
 * Queries: every verified caregiver with at least one relevant job. For each query
 * the open jobs are ranked by each method, using the SAME hard filters for all, so
 * the comparison isolates the scoring function:
 *     binary    cosine on binary skill vectors          (main method)
 *     weighted  cosine, proficiency/5 vs importance     (variant)
 *     keyword   number of required skills held          (baseline)
 * Ties are broken the same way for every method (newer job first, then job id).
 *
 * Metrics, averaged over queries:
 *     P@5, P@10   relevant jobs in the top K / K
 *     MAP         mean of average precision over the full ranked list
 *     ideal P@K   best possible P@K given how many relevant jobs each caregiver has
 *                 (many have fewer than K, so P@K cannot reach 1)
 * Writes ml_eval/recommender_results.txt.
 *
 * Note for the report: the ground truth is rule-based on synthetic data and uses skill
 * coverage, which the methods also use, so absolute values are optimistic. The
 * comparison between methods on the same data is the meaningful result.
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'api_backend', 'package.json'));
req('dotenv').config({ path: path.join(root, 'api_backend', '.env') });
const { Client } = req('pg');
const rec = require(path.join(root, 'api_backend', 'services', 'recommender.js'));

const KS = [5, 10];
const noFilters = process.argv.includes('--no-filters');

function averagePrecision(rankedIds, relevant) {
  let hits = 0; let sum = 0;
  rankedIds.forEach((id, i) => {
    if (relevant.has(id)) { hits++; sum += hits / (i + 1); }
  });
  return relevant.size ? sum / relevant.size : 0;
}
const precisionAt = (rankedIds, relevant, k) => rankedIds.slice(0, k).filter((id) => relevant.has(id)).length / k;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/** Keyword baseline: shared tag count, same filters and tie-breaks as the cosine methods. */
function rankKeyword(caregiver, jobs) {
  return jobs
    .filter((j) => noFilters || rec.hardFilters(caregiver, j).pass)
    .map((j) => ({ job: j, score: rec.sharedTagCount(caregiver.skills, j.requirements), held: [] }))
    .filter((m) => m.score > 0)
    .sort(rec.compareMatches);
}

async function main() {
  const gtPath = path.join(root, 'database', 'seeds', 'ground_truth.json');
  const groundTruth = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const vocab = await rec.loadVocabulary(db);
    const jobs = await rec.loadOpenJobs(db);
    const missingJobs = Object.keys(groundTruth).filter((id) => !jobs.some((j) => j.job_id === id));
    if (missingJobs.length === Object.keys(groundTruth).length) {
      throw new Error('None of the ground-truth jobs are in the database: re-run the seed, then this script.');
    }

    // invert job -> caregivers into caregiver -> relevant jobs
    const relevantJobs = new Map();
    for (const [jobId, { relevant }] of Object.entries(groundTruth)) {
      for (const cg of relevant) {
        if (!relevantJobs.has(cg)) relevantJobs.set(cg, new Set());
        relevantJobs.get(cg).add(jobId);
      }
    }

    const methods = {
      binary: (c) => rec.rankJobs(c, jobs, vocab, { method: 'binary', ignoreFilters: noFilters }),
      weighted: (c) => rec.rankJobs(c, jobs, vocab, { method: 'weighted', ignoreFilters: noFilters }),
      keyword: (c) => rankKeyword(c, jobs),
    };
    const scores = Object.fromEntries(Object.keys(methods).map((m) => [m, { ap: [], ...Object.fromEntries(KS.map((k) => [`p${k}`, []])) }]));
    const ideal = Object.fromEntries(KS.map((k) => [k, []]));
    let queries = 0;

    for (const [caregiverId, relevant] of relevantJobs) {
      const caregiver = await rec.loadCaregiver(db, caregiverId);
      if (!caregiver || caregiver.onboarding_status !== 'verified') continue;
      queries++;
      for (const k of KS) ideal[k].push(Math.min(relevant.size, k) / k);
      for (const [name, rank] of Object.entries(methods)) {
        const ids = rank(caregiver).map((m) => m.job.job_id);
        scores[name].ap.push(averagePrecision(ids, relevant));
        for (const k of KS) scores[name][`p${k}`].push(precisionAt(ids, relevant, k));
      }
    }

    const avgRelevant = mean([...relevantJobs.values()].map((s) => s.size));
    const lines = [
      `Recommender evaluation (${noFilters ? 'hard filters OFF (ablation)' : 'same hard filters for all methods'})`,
      `Queries: ${queries} verified caregivers with at least one relevant job; open jobs: ${jobs.length}; ` +
        `vocabulary: ${vocab.ids.length} skills; mean relevant jobs per caregiver: ${avgRelevant.toFixed(2)}`,
      '',
      `${'Method'.padEnd(26)}${KS.map((k) => `P@${k}`.padStart(9)).join('')}${'MAP'.padStart(9)}`,
      ...Object.entries({ 'Binary cosine (main)': 'binary', 'Weighted cosine': 'weighted', 'Keyword baseline': 'keyword' })
        .map(([label, m]) => `${label.padEnd(26)}${KS.map((k) => mean(scores[m][`p${k}`]).toFixed(4).padStart(9)).join('')}${mean(scores[m].ap).toFixed(4).padStart(9)}`),
      `${'Ideal (upper bound)'.padEnd(26)}${KS.map((k) => mean(ideal[k]).toFixed(4).padStart(9)).join('')}${'1.0000'.padStart(9)}`,
    ];
    const text = lines.join('\n');
    console.log(text);
    const out = path.join(__dirname, noFilters ? 'recommender_results_no_filters.txt' : 'recommender_results.txt');
    fs.writeFileSync(out, `${text}\n`);
    console.log(`\nSaved ${path.relative(root, out)}`);
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
