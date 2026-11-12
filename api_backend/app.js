// Express app (no listen here, so tests can start it on any port).
const express = require('express');
const multer = require('multer');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '1mb' }));

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
