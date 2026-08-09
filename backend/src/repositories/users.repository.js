const db = require('../config/db');

async function findUsers({ limit, offset }) {
  // mysql2 doesn't reliably accept LIMIT/OFFSET as bound `?` placeholders
  // (ER_WRONG_ARGUMENTS) - safe to inline here since callers (users.service
  // parsePagination) already clamp these to validated integers, and this
  // re-clamps defensively in case this is ever called another way.
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;

  const [rows] = await db.execute(`
    SELECT id, name, email, provider, role, created_at
    FROM users
    ORDER BY created_at DESC
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `);

  return rows;
}

async function countUsers() {
  const [rows] = await db.execute('SELECT COUNT(*) AS count FROM users');
  return rows[0].count;
}

async function findUserById(userId) {
  const [rows] = await db.execute(
    `
      SELECT id, name, email, provider, role, created_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

async function findStoreAccessForUser(userId) {
  const [rows] = await db.execute(
    `
      SELECT osa.id, osa.store_id, osa.access_role, osa.created_at,
             s.name AS store_name
      FROM owner_store_access osa
      JOIN stores s ON s.id = osa.store_id
      WHERE osa.user_id = ?
      ORDER BY s.name ASC
    `,
    [userId]
  );

  return rows;
}

async function grantStoreAccess(userId, storeId, accessRole) {
  await db.execute(
    `
      INSERT INTO owner_store_access (user_id, store_id, access_role)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE access_role = VALUES(access_role)
    `,
    [userId, storeId, accessRole]
  );
}

async function revokeStoreAccess(userId, storeId) {
  const [result] = await db.execute(
    `
      DELETE FROM owner_store_access
      WHERE user_id = ?
        AND store_id = ?
    `,
    [userId, storeId]
  );

  return result.affectedRows > 0;
}

module.exports = {
  findUsers,
  countUsers,
  findUserById,
  findStoreAccessForUser,
  grantStoreAccess,
  revokeStoreAccess,
};
