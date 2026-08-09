const db = require('../config/db');

async function insertStore({ name, address, phone }) {
  const [result] = await db.execute(
    `
      INSERT INTO stores (name, address, phone, is_active)
      VALUES (?, ?, ?, TRUE)
    `,
    [name, address || null, phone || null]
  );

  return result.insertId;
}

async function findStoreById(storeId) {
  const [rows] = await db.execute(
    `
      SELECT *
      FROM stores
      WHERE id = ?
      LIMIT 1
    `,
    [storeId]
  );

  return rows[0] || null;
}

async function findAllStoresWithProductCount() {
  const [rows] = await db.execute(`
    SELECT
      s.*,
      COUNT(DISTINCT p.id) AS product_count
    FROM stores s
    LEFT JOIN products p
      ON p.store_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `);

  return rows;
}

async function findStoresForOwner(userId) {
  const [rows] = await db.execute(
    `
      SELECT
        s.*,
        osa.access_role,
        COUNT(DISTINCT p.id) AS product_count
      FROM stores s
      INNER JOIN owner_store_access osa
        ON osa.store_id = s.id
      LEFT JOIN products p
        ON p.store_id = s.id
      WHERE osa.user_id = ?
      GROUP BY s.id, osa.access_role
      ORDER BY s.created_at DESC
    `,
    [userId]
  );

  return rows;
}

async function findPublicStores() {
  const [rows] = await db.execute(`
    SELECT id, name, address, phone
    FROM stores
    WHERE is_active = TRUE
    ORDER BY name ASC
  `);

  return rows;
}

async function updateStore(storeId, { name, address, phone }) {
  const [result] = await db.execute(
    `
      UPDATE stores
      SET name = ?, address = ?, phone = ?
      WHERE id = ?
    `,
    [name, address || null, phone || null, storeId]
  );

  return result.affectedRows > 0;
}

async function updateStoreStatus(storeId, isActive) {
  const [result] = await db.execute(
    `
      UPDATE stores
      SET is_active = ?
      WHERE id = ?
    `,
    [isActive, storeId]
  );

  return result.affectedRows > 0;
}

module.exports = {
  insertStore,
  findStoreById,
  findAllStoresWithProductCount,
  findStoresForOwner,
  findPublicStores,
  updateStore,
  updateStoreStatus,
};
