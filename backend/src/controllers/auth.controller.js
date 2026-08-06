const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const db = require('../config/db');

const {
  buildGoogleAuthUrl,
  buildFacebookAuthUrl,
  buildLineAuthUrl,
} = require('../services/oauth.service');

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:5000';

function signUser(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      provider: user.provider,
      role: user.role || 'customer',
    },
    process.env.JWT_SECRET || 'change_me',
    {
      expiresIn: '7d',
    }
  );
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
  try {
    const profile = req.user;

    if (!profile) {
      return res.status(401).json({
        message: 'Google user profile was not found',
      });
    }

    const providerId = getProviderId(profile);

    if (!providerId) {
      return res.status(400).json({
        message: 'Google profile does not contain a provider ID',
      });
    }

    const user = await upsertUser({
      name: getProfileName(profile),
      email: getProfileEmail(profile),
      provider: 'google',
      providerId,
      avatarUrl: getProfileAvatar(profile),
    });

    const token = signUser(user);

    return res.redirect(redirectToFrontend(token));
  } catch (error) {
    console.error('Google callback error:', error);
    return res.status(500).json({
      message: 'Google login failed',
    });
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
  try {
    const profile = req.user;

    if (!profile) {
      return res.status(401).json({
        message: 'Facebook user profile was not found',
      });
    }

    const providerId = getProviderId(profile);

    if (!providerId) {
      return res.status(400).json({
        message: 'Facebook profile does not contain a provider ID',
      });
    }

    const user = await upsertUser({
      name: getProfileName(profile),
      email: getProfileEmail(profile),
      provider: 'facebook',
      providerId,
      avatarUrl: getProfileAvatar(profile),
    });

    const token = signUser(user);

    return res.redirect(redirectToFrontend(token));
  } catch (error) {
    console.error('Facebook callback error:', error);
    return res.status(500).json({
      message: 'Facebook login failed',
    });
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
  try {
    const profile = req.user;

    if (!profile) {
      return res.status(401).json({
        message: 'LINE user profile was not found',
      });
    }

    const providerId = getProviderId(profile);

    if (!providerId) {
      return res.status(400).json({
        message: 'LINE profile does not contain a provider ID',
      });
    }

    const user = await upsertUser({
      name: getProfileName(profile),
      email: getProfileEmail(profile),
      provider: 'line',
      providerId,
      avatarUrl: getProfileAvatar(profile),
    });

    const token = signUser(user);

    return res.redirect(redirectToFrontend(token));
  } catch (error) {
    console.error('LINE callback error:', error);
    return res.status(500).json({
      message: 'LINE login failed',
    });
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

    const [rows] = await db.execute(
      `
        SELECT *
        FROM users
        WHERE provider = 'local'
          AND provider_id = ?
          AND role = 'admin'
        LIMIT 1
      `,
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        message: 'Invalid admin credentials',
      });
    }

    const user = rows[0];

    if (!user.password_hash) {
      return res.status(500).json({
        message: 'This admin account does not have a password configured',
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: 'Invalid admin credentials',
      });
    }

    const token = signUser(user);

    return res.status(200).json({
      message: 'Admin login successful',
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

exports.me = async (req, res) => {
  try {
    const authorization = req.headers.authorization || '';

    if (!authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authorization token is required',
      });
    }

    const token = authorization.substring('Bearer '.length);

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'change_me'
    );

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