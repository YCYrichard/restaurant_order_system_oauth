const axios = require('axios');
const jwt = require('jsonwebtoken');

const env = require('../config/env');

// Reuses JWT_SECRET to sign short-lived OAuth 'state' tokens. This is a
// distinct token purpose from user session tokens (see token.service.js
// issueAccessToken) - it only proves the callback round-tripped through our
// own redirect, per the authorization-code flow CSRF requirement.
const STATE_SECRET = env.JWT_SECRET;
const STATE_TTL_SECONDS = 300; // 5 minutes - long enough to complete provider login

// `next` is an in-app path (e.g. '/store/5/checkout') to return to after
// login - carried through the provider round-trip inside the signed state
// token, since that's the only thing that survives it unmodified. Only a
// same-origin relative path is accepted, so a tampered or malicious value
// can't turn this into an open redirect.
function isSafeNextPath(next) {
  if (typeof next !== 'string' || next.length === 0 || !next.startsWith('/')) {
    return false;
  }

  // Reject anything that can turn into a scheme-relative redirect to
  // another origin once a browser normalizes it: "//evil.com" is the
  // obvious case, but a leading backslash ("/\evil.com", "/\/evil.com")
  // passes a startsWith('/') && !startsWith('//') check while several
  // browsers still treat backslash as a path separator and coerce it to
  // "//evil.com" before navigating.
  return !/^\/[/\\]/.test(next);
}

function createOAuthState(provider, next) {
  return jwt.sign(
    { provider, next: isSafeNextPath(next) ? next : undefined },
    STATE_SECRET,
    { expiresIn: STATE_TTL_SECONDS }
  );
}

function verifyOAuthState(state, provider) {
  if (!state) {
    throw new Error('Missing OAuth state parameter');
  }

  const decoded = jwt.verify(state, STATE_SECRET, { algorithms: ['HS256'] });

  if (decoded.provider !== provider) {
    throw new Error('OAuth state does not match provider');
  }

  return { next: isSafeNextPath(decoded.next) ? decoded.next : null };
}

function buildGoogleAuthUrl(next) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state: createOAuthState('google', next),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function buildFacebookAuthUrl(next) {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_CLIENT_ID,
    redirect_uri: process.env.FACEBOOK_REDIRECT_URI,
    scope: 'email,public_profile',
    response_type: 'code',
    state: createOAuthState('facebook', next),
  });
  return `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
}

function buildLineAuthUrl(next) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINE_CLIENT_ID,
    redirect_uri: process.env.LINE_REDIRECT_URI,
    state: createOAuthState('line', next),
    scope: 'profile openid email',
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}

// --- Authorization-code exchange + profile fetch ---
// Each returns a normalized { id, name, email, avatarUrl } shape so
// auth.controller.js's getProviderId/getProfileName/etc. helpers keep working.

async function exchangeGoogleCode(code) {
  const tokenResponse = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const accessToken = tokenResponse.data.access_token;

  const profileResponse = await axios.get(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const profile = profileResponse.data;

  return {
    id: profile.sub,
    name: profile.name,
    email: profile.email,
    avatarUrl: profile.picture,
  };
}

async function exchangeFacebookCode(code) {
  const tokenResponse = await axios.get(
    'https://graph.facebook.com/v20.0/oauth/access_token',
    {
      params: {
        code,
        client_id: process.env.FACEBOOK_CLIENT_ID,
        client_secret: process.env.FACEBOOK_CLIENT_SECRET,
        redirect_uri: process.env.FACEBOOK_REDIRECT_URI,
      },
    }
  );

  const accessToken = tokenResponse.data.access_token;

  const profileResponse = await axios.get('https://graph.facebook.com/me', {
    params: {
      fields: 'id,name,email,picture',
      access_token: accessToken,
    },
  });

  const profile = profileResponse.data;

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    avatarUrl: profile.picture?.data?.url,
  };
}

async function exchangeLineCode(code) {
  const tokenResponse = await axios.post(
    'https://api.line.me/oauth2/v2.1/token',
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.LINE_REDIRECT_URI,
      client_id: process.env.LINE_CLIENT_ID,
      client_secret: process.env.LINE_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const accessToken = tokenResponse.data.access_token;

  const profileResponse = await axios.get('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const profile = profileResponse.data;

  return {
    id: profile.userId,
    name: profile.displayName,
    // LINE only includes email if the channel is verified for email scope
    // and it's read from the id_token, not this endpoint - left null here
    // deliberately rather than guessing.
    email: null,
    avatarUrl: profile.pictureUrl,
  };
}

module.exports = {
  buildGoogleAuthUrl,
  buildFacebookAuthUrl,
  buildLineAuthUrl,
  verifyOAuthState,
  exchangeGoogleCode,
  exchangeFacebookCode,
  exchangeLineCode,
};
