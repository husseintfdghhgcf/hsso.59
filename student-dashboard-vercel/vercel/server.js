'use strict';
// Local development runner (Vercel uses api/index.js instead).
const app = require('./app');
const config = require('./src/config');

app.listen(config.port, () => {
  console.log(`Student dashboard running on http://localhost:${config.port}`);
});
