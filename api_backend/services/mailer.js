/**
 * Email delivery (nodemailer).
 *
 *   Gmail (simplest):  SMTP_SERVICE=gmail, SMTP_USER=you@gmail.com, SMTP_PASS=<16-letter app password>
 *   Any SMTP server:   SMTP_HOST, SMTP_PORT (587 or 465), SMTP_USER, SMTP_PASS
 *   MAIL_FROM          sender shown to users, e.g. "CareMatch <you@gmail.com>" (default: SMTP_USER)
 *
 * With none of these set (development and tests) emails are printed to the console
 * instead of sent, and the last one is kept in memory for the tests.
 */
const nodemailer = require('nodemailer');

let transport = null;
let lastMessage = null;

function getTransport() {
  if (transport) return transport;
  const { SMTP_SERVICE, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_USER && SMTP_PASS && (SMTP_SERVICE || SMTP_HOST)) {
    transport = nodemailer.createTransport(SMTP_SERVICE
      ? { service: SMTP_SERVICE, auth: { user: SMTP_USER, pass: SMTP_PASS } }
      : { host: SMTP_HOST, port: Number(SMTP_PORT || 587), secure: Number(SMTP_PORT) === 465,
          auth: { user: SMTP_USER, pass: SMTP_PASS } });
  } else {
    transport = nodemailer.createTransport({ jsonTransport: true }); // nothing leaves the machine
  }
  return transport;
}

const isConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS
  && (process.env.SMTP_SERVICE || process.env.SMTP_HOST));

async function send({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'CareMatch <no-reply@carematch.local>';
  const info = await getTransport().sendMail({ from, to, subject, text, html });
  lastMessage = { to, subject, text };
  if (!isConfigured() && process.env.NODE_ENV !== 'test') {
    console.log(`[mail not configured] To: ${to} | ${subject}\n${text}`);
  }
  return info;
}

const CODE_TEXT = {
  email_verification: ['Your CareMatch verification code', 'Use this code to verify your email address'],
  password_reset: ['Your CareMatch password reset code', 'Use this code to reset your password'],
};

/** Sends a 6-digit code. Failures are logged and reported, never thrown at the user. */
async function sendCode(to, firstName, code, purpose, minutes) {
  const [subject, intro] = CODE_TEXT[purpose] || CODE_TEXT.email_verification;
  const text = `Hello ${firstName || ''},\n\n${intro}: ${code}\n\nThe code expires in ${minutes} minutes. `
    + 'If you did not request it, you can ignore this email.\n\nCareMatch';
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;color:#0B1B33">
    <h2 style="color:#0049AC;margin:0 0 12px">CareMatch</h2>
    <p>Hello ${escapeHtml(firstName || '')},</p><p>${intro}:</p>
    <p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#0049AC;margin:16px 0">${code}</p>
    <p>The code expires in ${minutes} minutes. If you did not request it, you can ignore this email.</p></div>`;
  try {
    await send({ to, subject, text, html });
    return true;
  } catch (err) {
    console.error(`Email to ${to} failed: ${err.message}`);
    return false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { send, sendCode, isConfigured, lastMessage: () => lastMessage };
