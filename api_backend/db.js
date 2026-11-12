// Shared PostgreSQL pool. DATABASE_URL comes from api_backend/.env.
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  /** Runs fn(client) inside BEGIN/COMMIT, rolling back on any error. */
  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },
};
