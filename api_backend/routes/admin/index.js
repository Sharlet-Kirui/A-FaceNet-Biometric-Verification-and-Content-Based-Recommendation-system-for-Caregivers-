// /admin: everything the React dashboard uses. Login is public; the rest needs an admin token.
const express = require('express');
const { requireAdmin } = require('../../middleware/adminAuth');

const router = express.Router();
router.use('/auth', require('./auth'));
router.use(requireAdmin);
router.use(require('./review'));
router.use(require('./jobs'));
router.use(require('./manage'));

module.exports = router;
