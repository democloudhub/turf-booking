require('dotenv').config();
const { ensureSchema } = require('../src/db');

ensureSchema()
  .then(() => {
    console.log('Database schema ready.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
