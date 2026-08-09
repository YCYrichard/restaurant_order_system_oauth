const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const db = require('../config/db');
const env = require('../config/env');
const tokenService = require('../services/token.service');

const {
  buildGoogleAuthUrl,
  buildFacebookAuthUrl,
  buildLineAuthUrl,
  verifyOAuthState,
  exchangeGoogleCode,
  exchangeFacebookCode,
  exchangeLineCode,
} = require('../services/oauth.service');

const FRONTEND_URL = env.FRONTEND_URL;

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/auth';

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: tokenService.REFRESH_TOKEN_TTL_MS,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

// Issues an access token and sets a rotating refresh token cookie. Used by
// every login path (OAuth callbacks and local admin login) so they all get
// the same session shape.
async function issueSession(res, user, req) {
  const accessToken = tokenService.issueAccessToken(user);

  const refreshToken = await tokenService.issueRefreshToken(user.id, {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  setRefreshCookie(res, refreshToken);

  return accessToken;
}

async function upsertUser({
  name,
  email,
  provider,
  providerId,
  avatarUrl = null,
}) {
  const [existingRows] = await db.execute(
    `
      SELECT *
      FROM users
      WHERE provider = ?
        AND provider_id = ?
      LIMIT 1
    `,
    [provider, providerId]
  );

  if (existingRows.length > 0) {
    const existingUser = existingRows[0];

    await db.execute(
      `
        UPDATE users
        SET
          name = ?,
          email = ?,
          avatar_url = ?
        WHERE id = ?
      `,
      [
        name || existingUser.name || 'User',
        email || existingUser.email || null,
        avatarUrl || existingUser.avatar_url || null,
        existingUser.id,
      ]
    );

    const [updatedRows] = await db.execute(
      `
        SELECT *
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [existingUser.id]
    );

    return updatedRows[0];
  }

  const [insertResult] = await db.execute(
    `
      INSERT INTO users (
        name,
        email,
        provider,
        provider_id,
        avatar_url,
        role
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      name || 'User',
      email || null,
      provider,
      providerId,
      avatarUrl,
      'customer',
    ]
  );

  const [createdRows] = await db.execute(
    `
      SELECT *
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [insertResult.insertId]
  );

  return createdRows[0];
}

function redirectToFrontend(token) {
  return `${FRONTEND_URL}/#/auth-success?token=${encodeURIComponent(token)}`;
}

function redirectToFrontendError(message) {
  return `${FRONTEND_URL}/#/auth-error?message=${encodeURIComponent(message)}`;
}

function getProviderId(profile) {
  return (
    profile.id ||
    profile.sub ||
    profile.userId ||
    profile.user_id ||
    null
  );
}

function getProfileName(profile) {
  return (
    profile.name ||
    profile.displayName ||
    profile.display_name ||
    profile.username ||
    'User'
  );
}

function getProfileEmail(profile) {
  return profile.email || profile.emailAddress || null;
}

function getProfileAvatar(profile) {
  return (
    profile.avatar_url ||
    profile.avatarUrl ||
    profile.picture ||
    profile.profile_image_url ||
    null
  );
}

exports.googleLogin = async (req, res) => {
  try {
    const authUrl = buildGoogleAuthUrl();
    return res.redirect(authUrl);
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(500).json({
      message: 'Unable to start Google login',
    });
  }
};

exports.googleCallback = async (req, res) => {
  const { code, state, error: providerError } = req.query;

  try {
    if (providerError) {
      return res.redirect(
        redirectToFrontendError('Google sign-in was cancelled.')
      );
    }

    if (!code) {
      return res.redirect(
        redirectToFrontendError('Google sign-in did not return a code.')
      );
    }

    try {
      verifyOAuthState(state, 'google');
    } catch (stateError) {
      console.error('Google OAuth state validation failed:', stateError);
      return res.redirect(
        redirectToFrontendError('Google sign-in session expired. Please try again.')
      );
    }

    const profile = await exchangeGoogleCode(code);
    const providerId = getProviderId(profile);

    if (!providerId) {
      return res.redirect(
        redirectToFrontendError('Google profile does not contain a provider ID.')
      );
    }

    const user = await upsertUser({
      name: getProfileName(profile),
      email: getProfileEmail(profile),
      provider: 'google',
      providerId,
      avatarUrl: getProfileAvatar(profile),
    });

    const token = await issueSession(res, user, req);

    return res.redirect(redirectToFrontend(token));
  } catch (error) {
    console.error('Google callback error:', error.response?.data || error);
    return res.redirect(
      redirectToFrontendError('Google sign-in failed. Please try again.')
    );
  }
};

exports.facebookLogin = async (req, res) => {
  try {
    const authUrl = buildFacebookAuthUrl();
    return res.redirect(authUrl);
  } catch (error) {
    console.error('Facebook login error:', error);
    return res.status(500).json({
      message: 'Unable to start Facebook login',
    });
  }
};

exports.facebookCallback = async (req, res) => {
  const { code, state, error: providerError } = req.query;

  try {
    if (providerError) {
      return res.redirect(
        redirectToFrontendError('Facebook sign-in was cancelled.')
      );
    }

    if (!code) {
      return res.redirect(
        redirectToFrontendError('Facebook sign-in did not return a code.')
      );
    }

    try {
      verifyOAuthState(state, 'facebook');
    } catch (stateError) {
      console.error('Facebook OAuth state validation failed:', stateError);
      return res.redirect(
        redirectToFrontendError('Facebook sign-in session expired. Please try again.')
      );
    }

    const profile = await exchangeFacebookCode(code);
    const providerId = getProviderId(profile);

    if (!providerId) {
      return res.redirect(
        redirectToFrontendError('Facebook profile does not contain a provider ID.')
      );
    }

    const user = await upsertUser({
      name: getProfileName(profile),
      email: getProfileEmail(profile),
      provider: 'facebook',
      providerId,
      avatarUrl: getProfileAvatar(profile),
    });

    const token = await issueSession(res, user, req);

    return res.redirect(redirectToFrontend(token));
  } catch (error) {
    console.error('Facebook callback error:', error.response?.data || error);
    return res.redirect(
      redirectToFrontendError('Facebook sign-in failed. Please try again.')
    );
  }
};

exports.lineLogin = async (req, res) => {
  try {
    const authUrl = buildLineAuthUrl();
    return res.redirect(authUrl);
  } catch (error) {
    console.error('LINE login error:', error);
    return res.status(500).json({
      message: 'Unable to start LINE login',
    });
  }
};

exports.lineCallback = async (req, res) => {
  const { code, state, error: providerError } = req.query;

  try {
    if (providerError) {
      return res.redirect(
        redirectToFrontendError('LINE sign-in was cancelled.')
      );
    }

    if (!code) {
      return res.redirect(
        redirectToFrontendError('LINE sign-in did not return a code.')
      );
    }

    try {
      verifyOAuthState(state, 'line');
    } catch (stateError) {
      console.error('LINE OAuth state validation failed:', stateError);
      return res.redirect(
        redirectToFrontendError('LINE sign-in session expired. Please try again.')
      );
    }

    const profile = await exchangeLineCode(code);
    const providerId = getProviderId(profile);

    if (!providerId) {
      return res.redirect(
        redirectToFrontendError('LINE profile does not contain a provider ID.')
      );
    }

    const user = await upsertUser({
      name: getProfileName(profile),
      email: getProfileEmail(profile),
      provider: 'line',
      providerId,
      avatarUrl: getProfileAvatar(profile),
    });

    const token = await issueSession(res, user, req);

    return res.redirect(redirectToFrontend(token));
  } catch (error) {
    console.error('LINE callback error:', error.response?.data || error);
    return res.redirect(
      redirectToFrontendError('LINE sign-in failed. Please try again.')
    );
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const username =
      typeof req.body.username === 'string'
        ? req.body.username.trim()
        : '';

    const password =
      typeof req.body.password === 'string'
        ? req.body.password
        : '';

    if (!username || !password) {
      return res.status(400).json({
        message: 'Username and password are required',
      });
    }

    // Any staff role may sign in here, not just admins - a kitchen needs
    // its own credentials rather than borrowing the owner's. What each role
    // can then do is still decided downstream by requireAdmin /
    // requireStoreAccess; this only establishes who they are.
    const [rows] = await db.execute(
      `
        SELECT *
        FROM users
        WHERE provider = 'local'
          AND provider_id = ?
          AND role IN ('admin', 'owner', 'staff')
        LIMIT 1
      `,
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        message: 'Invalid credentials',
      });
    }

    const user = rows[0];

    if (!user.password_hash) {
      return res.status(500).json({
        message: 'This account does not have a password configured',
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: 'Invalid credentials',
      });
    }

    const token = await issueSession(res, user, req);

    return res.status(200).json({
      message: 'Signed in successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        provider: user.provider,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);

    return res.status(500).json({
      message: 'Admin login failed',
    });
  }
};

exports.refresh = async (req, res) => {
  try {
    const presentedToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!presentedToken) {
      return res.status(401).json({
        message: 'Refresh token is required',
      });
    }

    const result = await tokenService.rotateRefreshToken(presentedToken, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    if (result.error) {
      clearRefreshCookie(res);
      return res.status(401).json({
        message: 'Refresh token is invalid or expired',
      });
    }

    const [rows] = await db.execute(
      `
        SELECT *
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [result.userId]
    );

    if (rows.length === 0) {
      clearRefreshCookie(res);
      return res.status(401).json({
        message: 'User not found',
      });
    }

    const user = rows[0];
    const accessToken = tokenService.issueAccessToken(user);

    setRefreshCookie(res, result.token);

    return res.status(200).json({
      token: accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        provider: user.provider,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);

    return res.status(500).json({
      message: 'Unable to refresh session',
    });
  }
};

exports.logout = async (req, res) => {
  try {
    const presentedToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (presentedToken) {
      await tokenService.revokeRefreshToken(presentedToken);
    }

    clearRefreshCookie(res);

    return res.status(200).json({
      message: 'Logged out',
    });
  } catch (error) {
    console.error('Logout error:', error);

    return res.status(500).json({
      message: 'Unable to log out',
    });
  }
};

exports.me = async (req, res) => {
  try {
    const authorization = req.headers.authorization || '';

    if (!authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authorization token is required',
      });
    }

    const token = authorization.substring('Bearer '.length);

    const decoded = jwt.verify(token, env.JWT_SECRET);

    const [rows] = await db.execute(
      `
        SELECT
          id,
          name,
          email,
          provider,
          provider_id,
          avatar_url,
          role,
          created_at
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    return res.status(200).json({
      user: rows[0],
    });
  } catch (error) {
    console.error('Get current user error:', error);

    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      return res.status(401).json({
        message: 'Invalid or expired token',
      });
    }

    return res.status(500).json({
      message: 'Unable to load current user',
    });
  }
};
