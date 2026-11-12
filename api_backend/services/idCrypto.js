// ID / passport number protection. Same scheme as database/seeds/seed.js:
//   encryptId -> base64(iv[12] | authTag[16] | ciphertext), AES-256-GCM
//   hashId    -> HMAC-SHA256 hex of "<id_type>|<nationality>|<id_number>", used only for uniqueness
// The AES key is SHA-256(ID_ENC_KEY), so any string works as ID_ENC_KEY.
const crypto = require('crypto');

function key() {
  if (!process.env.ID_ENC_KEY) throw new Error('ID_ENC_KEY is not set in api_backend/.env');
  return crypto.createHash('sha256').update(process.env.ID_ENC_KEY).digest();
}

function encryptId(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function decryptId(b64) {
  const buf = Buffer.from(b64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

function hashId(idType, nationality, idNumber) {
  if (!process.env.ID_HMAC_KEY) throw new Error('ID_HMAC_KEY is not set in api_backend/.env');
  return crypto.createHmac('sha256', process.env.ID_HMAC_KEY)
    .update(`${idType}|${nationality}|${idNumber}`).digest('hex');
}

module.exports = { encryptId, decryptId, hashId };
