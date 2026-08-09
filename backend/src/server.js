require('dotenv').config();

let app;
try {
  app = require('./app');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
