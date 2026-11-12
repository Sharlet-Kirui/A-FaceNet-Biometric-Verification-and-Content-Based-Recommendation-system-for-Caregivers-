// /notifications: the caregiver's in-app notifications (newest first) and read receipts.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /notifications  -> { unread, notifications: [...] } (latest 50)
router.get('/', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT notification_id, type, title, body, data, read_at, created_at FROM notifications
      WHERE caregiver_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.caregiverId]);
  const unread = (await db.query(
    'SELECT count(*)::int AS n FROM notifications WHERE caregiver_id = $1 AND read_at IS NULL', [req.caregiverId])).rows[0].n;
  res.json({
    unread,
    notifications: rows.map((n) => ({ id: n.notification_id, type: n.type, title: n.title, body: n.body,
      data: n.data, read: n.read_at != null, createdAt: n.created_at })),
  });
}));

// POST /notifications/read  { ids?: [...] }  -> marks those (or all) as read
router.post('/read', requireAuth, wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)) : null;
  const { rowCount } = await db.query(
    `UPDATE notifications SET read_at = now()
      WHERE caregiver_id = $1 AND read_at IS NULL ${ids ? 'AND notification_id = ANY($2)' : ''}`,
    ids ? [req.caregiverId, ids] : [req.caregiverId]);
  res.json({ marked: rowCount });
}));

module.exports = router;
