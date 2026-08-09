const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const db = require('../config/db');
const env = require('../config/env');

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function issueAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      provider: user.provider,
      role: user.role || 'customer',
    },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateOpaqueToken() {
  return crypto.randomBytes(48).toString('hex');
}

async function issueRefreshToken(userId, { userAgent, ip } = {}) {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await db.execute(
    `
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
      VALUES (?, ?, ?, ?, ?)
    `,
    [userId, hashToken(token), expiresAt, userAgent || null, ip || null]
  );

  return token;
}

// Rotates a refresh token: the presented token is revoked and a new one is
// issued in its place. If a token that was already revoked gets presented
// again, that's a sign it was stolen and used after the legitimate client
// already rotated past it - the entire chain for that user is revoked.
async function rotateRefreshToken(presentedToken, { userAgent, ip } = {}) {
  const [rows] = await db.execute(
    `
      SELECT *
      FROM refresh_tokens
      WHERE token_hash = ?
      LIMIT 1
    `,
    [hashToken(presentedToken)]
  );

  if (rows.length === 0) {
    return { error: 'invalid' };
  }

  const record = rows[0];

  if (record.revoked_at) {
    await revokeAllForUser(record.user_id);
    return { error: 'reused' };
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    return { error: 'expired' };
  }

  const newToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const [insertResult] = await db.execute(
    `
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
      VALUES (?, ?, ?, ?, ?)
    `,
    [record.user_id, hashToken(newToken), expiresAt, userAgent || null, ip || null]
  );

  await db.execute(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW(), replaced_by_id = ?
      WHERE id = ?
    `,
    [insertResult.insertId, record.id]
  );

  return { userId: record.user_id, token: newToken };
}

async function revokeRefreshToken(presentedToken) {
  await db.execute(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE token_hash = ?
        AND revoked_at IS NULL
    `,
    [hashToken(presentedToken)]
  );
}

async function revokeAllForUser(userId) {
  await db.execute(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = ?
        AND revoked_at IS NULL
    `,
    [userId]
  );
}

module.exports = {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_MS,
  issueAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
};
