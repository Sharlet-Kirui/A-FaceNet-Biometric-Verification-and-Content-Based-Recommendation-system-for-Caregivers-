// Admin JWTs: { sub: adminId, role: 'admin', level: 'super_admin' | 'reviewer' }, valid 12 hours.
// Caregiver tokens are rejected here, and admin tokens are rejected by requireAuth.
const jwt = require('jsonwebtoken');

function secret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set in api_backend/.env');
  return process.env.JWT_SECRET;
}

const signAdminToken = (admin) =>
  jwt.sign({ sub: admin.admin_id, role: 'admin', level: admin.role_level }, secret(), { expiresIn: '12h' });

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = jwt.verify(token, secret());
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
    req.adminId = payload.sub;
    req.adminLevel = payload.level;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Use after requireAdmin: settings and categories change system behaviour. */
function requireSuperAdmin(req, res, next) {
  if (req.adminLevel !== 'super_admin') {
    return res.status(403).json({ error: 'Only a super administrator can do this', reason: 'super_admin_only' });
  }
  return next();
}

module.exports = { signAdminToken, requireAdmin, requireSuperAdmin };
