const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config/env');
const { isOwnerTier } = require('../utils/access-tier');

function getTokenFromRequest(req) {
  const authorization = req.headers.authorization || '';

  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  return authorization.substring('Bearer '.length).trim();
}

function requireAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        message: 'Authorization token is required',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    console.error('Authentication error:', error);

    return res.status(401).json({
      message: 'Invalid or expired authorization token',
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      message: 'Authentication is required',
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Administrator access is required',
    });
  }

  next();
}

async function requireStoreAccess(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: 'Authentication is required',
      });
    }

    if (req.user.role === 'admin') {
      req.storeAccessRole = 'admin';
      return next();
    }

    const storeId = Number(
      req.params.storeId || req.params.id
    );

    if (!Number.isInteger(storeId) || storeId <= 0) {
      return res.status(400).json({
        message: 'A valid store ID is required',
      });
    }

    const db = require('../config/db');

    const [rows] = await db.execute(
      `
        SELECT access_role
        FROM owner_store_access
        WHERE user_id = ?
          AND store_id = ?
        LIMIT 1
      `,
      [req.user.id, storeId]
    );

    if (rows.length === 0) {
      return res.status(403).json({
        message: 'You do not have access to this store',
      });
    }

    req.storeAccessRole = rows[0].access_role;
    next();
  } catch (error) {
    console.error('Store access error:', error);

    return res.status(500).json({
      message: 'Unable to verify store access',
    });
  }
}

// Run after requireStoreAccess, which sets req.storeAccessRole. Gates
// store-config/refund/deletion actions to owner-tier (owner/manager/admin) -
// kitchen/order-status routes never use this and stay open to plain staff.
function requireOwnerTier(req, res, next) {
  if (!isOwnerTier(req.storeAccessRole)) {
    return res.status(403).json({
      message: 'This action requires owner or manager access to the store',
    });
  }

  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireStoreAccess,
  requireOwnerTier,
};