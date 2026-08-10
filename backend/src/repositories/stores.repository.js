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

async function findHoursForStore(storeId) {
  const [rows] = await db.execute(
    `
      SELECT day_of_week, open_time, close_time, is_closed
      FROM store_hours
      WHERE store_id = ?
      ORDER BY day_of_week ASC
    `,
    [storeId]
  );

  return rows;
}

async function findClosureOnDate(storeId, isoDate) {
  const [rows] = await db.execute(
    `
      SELECT closure_date, reason
      FROM store_closures
      WHERE store_id = ?
        AND closure_date = ?
      LIMIT 1
    `,
    [storeId, isoDate]
  );

  return rows[0] || null;
}

/// Replaces the whole week in one transaction - a partial write would leave
/// a store half-open on days the caller thought it had set.
async function replaceHoursForStore(storeId, days) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute('DELETE FROM store_hours WHERE store_id = ?', [
      storeId,
    ]);

    for (const day of days) {
      await connection.execute(
        `
          INSERT INTO store_hours (
            store_id, day_of_week, open_time, close_time, is_closed
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          storeId,
          day.dayOfWeek,
          day.openTime,
          day.closeTime,
          day.isClosed ? 1 : 0,
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function insertClosure(storeId, { date, reason }) {
  await db.execute(
    `
      INSERT INTO store_closures (store_id, closure_date, reason)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE reason = VALUES(reason)
    `,
    [storeId, date, reason || null]
  );
}

async function deleteClosure(storeId, date) {
  const [result] = await db.execute(
    `
      DELETE FROM store_closures
      WHERE store_id = ?
        AND closure_date = ?
    `,
    [storeId, date]
  );

  return result.affectedRows > 0;
}

async function findClosuresForStore(storeId) {
  const [rows] = await db.execute(
    `
      SELECT closure_date, reason
      FROM store_closures
      WHERE store_id = ?
        AND closure_date >= CURDATE()
      ORDER BY closure_date ASC
    `,
    [storeId]
  );

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
  findHoursForStore,
  findClosureOnDate,
  findClosuresForStore,
  replaceHoursForStore,
  insertClosure,
  deleteClosure,
  findAllStoresWithProductCount,
  findStoresForOwner,
  findPublicStores,
  updateStore,
  updateStoreStatus,
};
