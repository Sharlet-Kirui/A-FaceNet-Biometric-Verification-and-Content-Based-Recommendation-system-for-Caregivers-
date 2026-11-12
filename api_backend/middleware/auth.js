// JWT helpers. Tokens carry { sub: caregiverId, role: 'caregiver' } and expire after 7 days.
const jwt = require('jsonwebtoken');

function secret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set in api_backend/.env');
  return process.env.JWT_SECRET;
}

const signToken = (caregiverId) =>
  jwt.sign({ sub: caregiverId, role: 'caregiver' }, secret(), { expiresIn: '7d' });

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = jwt.verify(token, secret());
    // admin tokens are not caregiver tokens (see middleware/adminAuth.js)
    if (payload.role !== 'caregiver') return res.status(401).json({ error: 'Caregiver token required' });
    req.caregiverId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { signToken, requireAuth };
