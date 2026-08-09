const app = require('./app');

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
