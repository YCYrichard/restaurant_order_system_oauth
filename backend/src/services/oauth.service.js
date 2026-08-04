function buildGoogleAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function buildFacebookAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_CLIENT_ID,
    redirect_uri: process.env.FACEBOOK_REDIRECT_URI,
    scope: 'email,public_profile',
    response_type: 'code'
  });
  return `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
}

function buildLineAuthUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINE_CLIENT_ID,
    redirect_uri: process.env.LINE_REDIRECT_URI,
    state: 'restaurant_order_state',
    scope: 'profile openid'
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}

module.exports = { buildGoogleAuthUrl, buildFacebookAuthUrl, buildLineAuthUrl };
