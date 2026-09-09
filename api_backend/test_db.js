require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => { console.log('Connected'); client.end(); })
  .catch(err => console.error('Connection error:', err));