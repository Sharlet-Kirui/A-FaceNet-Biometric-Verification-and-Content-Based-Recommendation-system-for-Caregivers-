// Entry point: loads .env, then starts the Express app.
require('dotenv').config();
const app = require('./app');

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`api_backend listening on http://localhost:${PORT}`);
  console.log(`ML service: ${process.env.ML_SERVICE_URL || 'http://localhost:8000'}`);
});
