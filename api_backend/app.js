// Express app (no listen here, so tests can start it on any port).
const express = require('express');
const multer = require('multer');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '1mb' }));

// The admin dashboard (Vite, http://localhost:5173) calls this API from another origin.
const DASHBOARD_ORIGINS = (process.env.DASHBOARD_ORIGIN || 'http://localhost:5173').split(',');
app.use((req, res, next) => {
  if (DASHBOARD_ORIGINS.includes(req.headers.origin)) {
    res.set({
      'Access-Control-Allow-Origin': req.headers.origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      Vary: 'Origin',
    });
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  return next();
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api_backend' }));
app.get('/health/db', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT now() AS time, version() AS version');
    res.json({ status: 'ok', database: 'connected', ...rows[0] });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable', error: err.message });
  }
});

app.use('/auth', require('./routes/auth'));
app.use('/', require('./routes/caregivers'));
app.use('/kyc', require('./routes/kyc'));
app.use('/recommendations', require('./routes/recommendations'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File larger than 5 MB' : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
