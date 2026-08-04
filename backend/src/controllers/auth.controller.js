const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { buildGoogleAuthUrl, buildFacebookAuthUrl, buildLineAuthUrl } = require('../services/oauth.service');

function signUser(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      provider: user.provider,
      role: user.role || 'customer'
    },
    process.env.JWT_SECRET || 'change_me',
    { expiresIn: '7d' }
  );
}

async function upsertUser({ name, email, provider, providerId, avatarUrl = null }) {
  const [rows] = await db.execute(
    'SELECT * FROM users WHERE provider = ? AND provider_id = ? LIMIT 1',
    [provider, providerId]
  );

  if (rows.length) return rows[0];

  const [result] = await db.execute(
    'INSERT INTO users (name, email, provider, provider_id, avatar_url, role) VALUES (?, ?, ?, ?, ?, ?)',
    [name || 'User', email || null, provider, providerId, avatarUrl, 'customer']
  );

  const [created] = await db.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId]);
  return created[0];
}

exports.googleLogin = async (_, res) => {
  res.redirect(buildGoogleAuthUrl());
};

exports.googleCallback = async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).json({ message: 'Missing code' });

    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    }, { headers: { 'Content-Type': 'application/json' } });

    const accessToken = tokenResponse.data.access_token;
    const userInfo = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const user = await upsertUser({
      name: userInfo.data.name,
      email: userInfo.data.email,
      provider: 'google',
      providerId: String(userInfo.data.id),
      avatarUrl: userInfo.data.picture || null
    });

    const token = signUser(user);
    res.redirect(`${process.env.FRONTEND_URL}/#/auth-success?token=${token}`);
  } catch (error) {
    res.status(500).json({ message: 'Google login failed', error: error.response?.data || error.message });
  }
};

exports.facebookLogin = async (_, res) => {
  res.redirect(buildFacebookAuthUrl());
};

exports.facebookCallback = async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).json({ message: 'Missing code' });

    const tokenResponse = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
      params: {
        client_id: process.env.FACEBOOK_CLIENT_ID,
        client_secret: process.env.FACEBOOK_CLIENT_SECRET,
        redirect_uri: process.env.FACEBOOK_REDIRECT_URI,
        code
      }
    });

    const accessToken = tokenResponse.data.access_token;
    const userInfo = await axios.get('https://graph.facebook.com/me', {
      params: {
        fields: 'id,name,email,picture',
        access_token: accessToken
      }
    });

    const user = await upsertUser({
      name: userInfo.data.name,
      email: userInfo.data.email || null,
      provider: 'facebook',
      providerId: String(userInfo.data.id),
      avatarUrl: userInfo.data.picture?.data?.url || null
    });

    const token = signUser(user);
    res.redirect(`${process.env.FRONTEND_URL}/#/auth-success?token=${token}`);
  } catch (error) {
    res.status(500).json({ message: 'Facebook login failed', error: error.response?.data || error.message });
  }
};

exports.lineLogin = async (_, res) => {
  res.redirect(buildLineAuthUrl());
};

exports.lineCallback = async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).json({ message: 'Missing code' });

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.LINE_REDIRECT_URI,
      client_id: process.env.LINE_CLIENT_ID,
      client_secret: process.env.LINE_CLIENT_SECRET
    });

    const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenResponse.data.access_token;
    const profile = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const user = await upsertUser({
      name: profile.data.displayName,
      email: null,
      provider: 'line',
      providerId: String(profile.data.userId),
      avatarUrl: profile.data.pictureUrl || null
    });

    const token = signUser(user);
    res.redirect(`${process.env.FRONTEND_URL}/#/auth-success?token=${token}`);
  } catch (error) {
    res.status(500).json({ message: 'LINE login failed', error: error.response?.data || error.message });
  }
};

exports.me = async (req, res) => {
  res.json({ message: 'Use token returned from auth-success route in frontend.' });
};
