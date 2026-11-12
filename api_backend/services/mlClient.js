// Calls the FastAPI ML microservice (ML_SERVICE_URL, default http://localhost:8000).
// Uses Node's built-in fetch / FormData / Blob (Node 18+).
const fs = require('fs/promises');
const path = require('path');

const baseUrl = () => (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 120000); // first DeepFace call loads the model

class MlServiceError extends Error {}

async function call(route, init) {
  let res;
  try {
    res = await fetch(baseUrl() + route, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new MlServiceError(`ML service unreachable at ${baseUrl()}${route}: ${err.message}`);
  }
  if (res.status === 404) return { notAvailable: true };
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new MlServiceError(`ML service ${route} returned ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function appendFile(form, field, filePath) {
  const data = await fs.readFile(filePath);
  form.append(field, new Blob([data]), path.basename(filePath));
}

/** POST /verify: ID photo + centre selfie -> detection, blur, distance, embeddings */
async function verifyFace(idImagePath, selfiePath, threshold) {
  const form = new FormData();
  await appendFile(form, 'id_image', idImagePath);
  await appendFile(form, 'selfie', selfiePath);
  form.append('threshold', String(threshold));
  return call('/verify', { method: 'POST', body: form });
}

/** POST /liveness: centre + turn frames + requested direction. Returns { notAvailable } until built. */
async function checkLiveness(centrePath, turnPaths, challenge, settings) {
  const form = new FormData();
  await appendFile(form, 'centre', centrePath);
  for (const p of turnPaths) await appendFile(form, 'turns', p);
  form.append('challenge', challenge);
  form.append('min_turn_ratio', String(settings.liveness_min_turn_ratio));
  form.append('same_person_threshold', String(settings.liveness_same_person_threshold));
  return call('/liveness', { method: 'POST', body: form });
}

/** POST /iprs/lookup: typed identity details -> { status } */
async function iprsLookup(details) {
  return call('/iprs/lookup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details),
  });
}

/** POST /ocr: ID front + typed details -> { ran, ocr_score, id_number, names, reason } */
async function readId(idImagePath, details) {
  const form = new FormData();
  await appendFile(form, 'id_image', idImagePath);
  for (const [k, v] of Object.entries(details)) form.append(k, String(v ?? ''));
  return call('/ocr', { method: 'POST', body: form });
}

module.exports = { verifyFace, checkLiveness, iprsLookup, readId, MlServiceError };
