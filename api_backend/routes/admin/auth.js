// POST /admin/auth/login, GET /admin/auth/me
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const { signAdminToken, requireAdmin } = require('../../middleware/adminAuth');
const { wrap } = require('./util');

const router = express.Router();

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const { rows } = await db.query(
    `SELECT admin_id, first_name, last_name, email, password_hash, role_level, is_active
       FROM admins WHERE lower(email) = $1`, [email]);
  const admin = rows[0];
  // same message for unknown email and wrong password
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  if (!admin.is_active) return res.status(403).json({ error: 'This administrator account is disabled' });
  await db.query('UPDATE admins SET last_login_at = now() WHERE admin_id = $1', [admin.admin_id]);
  res.json({
    token: signAdminToken(admin),
    admin: { adminId: admin.admin_id, firstName: admin.first_name, lastName: admin.last_name,
      email: admin.email, roleLevel: admin.role_level },
  });
}));

router.get('/me', requireAdmin, wrap(async (req, res) => {
  const { rows } = await db.query(
    'SELECT admin_id, first_name, last_name, email, role_level FROM admins WHERE admin_id = $1', [req.adminId]);
  if (!rows[0]) return res.status(404).json({ error: 'Administrator not found' });
  const a = rows[0];
  res.json({ adminId: a.admin_id, firstName: a.first_name, lastName: a.last_name, email: a.email, roleLevel: a.role_level });
}));

module.exports = router;
