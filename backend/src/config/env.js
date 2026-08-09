// Fail-fast environment validation. Replaces the `process.env.JWT_SECRET ||
// 'change_me'` fallback that was duplicated across auth.controller.js,
// auth.middleware.js, and oauth.service.js - if this is missing in a real
// deployment, we want a crash on boot, not a silently-insecure default.

const REQUIRED_VARS = [
  'JWT_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_NAME',
  'FRONTEND_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'FACEBOOK_CLIENT_ID',
  'FACEBOOK_CLIENT_SECRET',
  'FACEBOOK_REDIRECT_URI',
  'LINE_CLIENT_ID',
  'LINE_CLIENT_SECRET',
  'LINE_REDIRECT_URI',
];

function loadEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy backend/.env.example to backend/.env and fill them in.'
    );
  }

  return REQUIRED_VARS.reduce((config, key) => {
    config[key] = process.env[key];
    return config;
  }, {});
}

module.exports = loadEnv();
