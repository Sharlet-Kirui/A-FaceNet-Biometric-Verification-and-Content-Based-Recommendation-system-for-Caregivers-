// Email OTP: 6 digits, stored only as a hash, 10-minute expiry, 5 attempts, single use.
// Email sending is not wired yet: in development the code is logged to the console
// and returned as devOtp in the API response (never when NODE_ENV=production).
const crypto = require('crypto');

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const hashCode = (caregiverId, code) =>
  crypto.createHash('sha256').update(`${caregiverId}:${code}`).digest('hex');

async function issueOtp(db, caregiverId, purpose = 'email_verification') {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  // invalidate older unused codes for the same purpose
  await db.query(
    `UPDATE email_otps SET consumed_at = now()
      WHERE caregiver_id = $1 AND purpose = $2 AND consumed_at IS NULL`, [caregiverId, purpose]);
  await db.query(
    `INSERT INTO email_otps (caregiver_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [caregiverId, hashCode(caregiverId, code), purpose, String(OTP_TTL_MINUTES)]);
  if (process.env.NODE_ENV !== 'production') console.log(`[dev] OTP for ${caregiverId}: ${code}`);
  return code;
}

/** Returns { ok: true } or { ok: false, reason }. */
async function verifyOtp(db, caregiverId, code, purpose = 'email_verification') {
  const { rows } = await db.query(
    `SELECT otp_id, code_hash, expires_at, attempts FROM email_otps
      WHERE caregiver_id = $1 AND purpose = $2 AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`, [caregiverId, purpose]);
  const otp = rows[0];
  if (!otp) return { ok: false, reason: 'no_active_code' };
  if (new Date(otp.expires_at) < new Date()) return { ok: false, reason: 'expired' };
  if (otp.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };

  const given = Buffer.from(hashCode(caregiverId, String(code).trim()));
  const stored = Buffer.from(otp.code_hash);
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    await db.query('UPDATE email_otps SET attempts = attempts + 1 WHERE otp_id = $1', [otp.otp_id]);
    return { ok: false, reason: 'wrong_code' };
  }
  await db.query('UPDATE email_otps SET consumed_at = now() WHERE otp_id = $1', [otp.otp_id]);
  return { ok: true };
}

module.exports = { issueOtp, verifyOtp, OTP_TTL_MINUTES };
