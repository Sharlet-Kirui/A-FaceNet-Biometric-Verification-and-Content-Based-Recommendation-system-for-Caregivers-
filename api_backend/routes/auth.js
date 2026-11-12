// /auth: register, email OTP, login.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../middleware/auth');
const { issueOtp, verifyOtp } = require('../services/otp');
const { advanceStatus } = require('../services/onboarding');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const isDev = () => process.env.NODE_ENV !== 'production';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirrors mobile_app/lib/core/password_policy.dart: 8+ chars, upper, lower, digit, symbol
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

async function findByEmail(email) {
  const { rows } = await db.query(
    `SELECT caregiver_id, password_hash, email_verified_at, onboarding_status, first_name, last_name, email
       FROM caregivers WHERE lower(email) = lower($1)`, [email]);
  return rows[0];
}

// POST /auth/register  { fullName | firstName + lastName, email, phone?, password }
// The Create Account screen sends fullName; it is split at the first space.
router.post('/register', wrap(async (req, res) => {
  const { email, phone, password } = req.body || {};
  let { firstName, lastName } = req.body || {};
  if (!firstName && req.body?.fullName) {
    const parts = String(req.body.fullName).trim().split(/\s+/);
    firstName = parts.shift();
    lastName = parts.join(' ');
  }
  const errors = {};
  if (!firstName?.trim()) errors.firstName = 'required';
  if (!lastName?.trim()) errors.lastName = 'required';
  if (!EMAIL_RE.test(email || '')) errors.email = 'invalid email';
  if (!PASSWORD_RE.test(password || '')) errors.password = 'min 8 chars with upper, lower, number and symbol';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Validation failed', fields: errors });

  if (await findByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO caregivers (first_name, last_name, email, phone, password_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING caregiver_id`,
    [firstName.trim(), lastName.trim(), email.trim(), phone?.trim() || null, passwordHash]);
  const caregiverId = rows[0].caregiver_id;
  const code = await issueOtp(db, caregiverId);

  res.status(201).json({ caregiverId, message: 'Account created. Check your email for the verification code.',
    ...(isDev() && { devOtp: code }) });
}));

// POST /auth/otp/send  { email }
router.post('/otp/send', wrap(async (req, res) => {
  const user = await findByEmail(req.body?.email || '');
  // Same response whether or not the account exists, so emails cannot be probed
  if (!user || user.email_verified_at) return res.json({ message: 'If the account needs verification, a code was sent.' });
  const code = await issueOtp(db, user.caregiver_id);
  res.json({ message: 'If the account needs verification, a code was sent.', ...(isDev() && { devOtp: code }) });
}));

// POST /auth/otp/verify  { email, code }  -> JWT
router.post('/otp/verify', wrap(async (req, res) => {
  const user = await findByEmail(req.body?.email || '');
  if (!user) return res.status(400).json({ error: 'Invalid code', reason: 'wrong_code' });
  const result = await verifyOtp(db, user.caregiver_id, req.body?.code || '');
  if (!result.ok) return res.status(400).json({ error: 'Invalid code', reason: result.reason });

  await db.query('UPDATE caregivers SET email_verified_at = now() WHERE caregiver_id = $1', [user.caregiver_id]);
  await advanceStatus(db, user.caregiver_id, 'email_verified');
  res.json({ token: signToken(user.caregiver_id), caregiverId: user.caregiver_id });
}));

// POST /auth/login  { email, password }  -> JWT
router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await findByEmail(email || '');
  const ok = user && await bcrypt.compare(password || '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });
  if (!user.email_verified_at) {
    return res.status(403).json({ error: 'Email not verified', reason: 'email_not_verified' });
  }
  res.json({
    token: signToken(user.caregiver_id),
    caregiver: { caregiverId: user.caregiver_id, firstName: user.first_name, lastName: user.last_name,
      email: user.email, onboardingStatus: user.onboarding_status },
  });
}));

module.exports = router;
