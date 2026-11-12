// Helpers shared by the /admin routes.
const net = require('net');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || '');
const page = (q) => ({
  limit: Math.min(200, Math.max(1, Number.parseInt(q.limit, 10) || 50)),
  offset: Math.max(0, Number.parseInt(q.offset, 10) || 0),
});

/** Request IP for audit_logs.ip_address (inet), or null if it is not a valid address. */
function clientIp(req) {
  const ip = String(req.ip || '').replace(/^::ffff:/, '');
  return net.isIP(ip) ? ip : null;
}

/** One audit_logs row. `c` is a pool or a transaction client. */
async function audit(c, req, { actionType, rule = null, trustScoreId = null, details = {} }) {
  await c.query(
    `INSERT INTO audit_logs (admin_id, trust_score_id, action_type, rule_applied, action_details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [req.adminId || null, trustScoreId, actionType, rule, JSON.stringify(details), clientIp(req)]);
}

module.exports = { wrap, isUuid, page, clientIp, audit };
