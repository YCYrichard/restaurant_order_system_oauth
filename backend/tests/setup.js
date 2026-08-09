// Dummy values for the vars config/env.js requires at module-load time, so
// requiring src/app (transitively) doesn't throw in every test file. Tests
// that care about a specific value (e.g. JWT_SECRET) can still set it
// explicitly before their own requires - this only fills gaps.

const DEFAULTS = {
  JWT_SECRET: 'test_jwt_secret',
  DB_HOST: 'localhost',
  DB_USER: 'test',
  DB_NAME: 'test',
  FRONTEND_URL: 'http://localhost:5000',
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
  FACEBOOK_CLIENT_ID: 'test-facebook-client-id',
  FACEBOOK_CLIENT_SECRET: 'test-facebook-client-secret',
  FACEBOOK_REDIRECT_URI: 'http://localhost:3000/auth/facebook/callback',
  LINE_CLIENT_ID: 'test-line-client-id',
  LINE_CLIENT_SECRET: 'test-line-client-secret',
  LINE_REDIRECT_URI: 'http://localhost:3000/auth/line/callback',
};

for (const [key, value] of Object.entries(DEFAULTS)) {
  process.env[key] = process.env[key] || value;
}
