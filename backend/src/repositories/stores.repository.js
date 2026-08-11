const crypto = require('crypto');

const db = require('../config/db');

// The customer-facing identifier - see the public_code migration for why
// this exists (stores.id is sequential and guessable). base64url gives a
// compact, URL-safe string with no characters that need percent-encoding
// in a link or QR code.
function generateCode() {
  return crypto.randomBytes(8).toString('base64url');
}

/// Inserts with a fresh code, retrying on the rare collision - the UNIQUE
/// constraint on public_code makes this a real, DB-enforced check (unlike
/// the migration's backfill, which ran before that constraint existed).
async function insertStore({ name, address, phone }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [result] = await db.execute(
        `
          INSERT INTO stores (public_code, name, address, phone, is_active)
          VALUES (?, ?, ?, ?, TRUE)
        `,
        [generateCode(), name, address || null, phone || null]
      );

      return result.insertId;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') {
        throw error;
      }
    }
  }

  throw new Error('Could not generate a unique store code after 5 attempts');
}

/// Issues a new code for an existing store - the safety valve for a leaked
/// QR code or link: the old one stops resolving the moment this runs.
async function regenerateStoreCode(storeId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();

    try {
      const [result] = await db.execute(
        'UPDATE stores SET public_code = ? WHERE id = ?',
        [code, storeId]
      );

      return result.affectedRows > 0 ? code : null;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') {
        throw error;
      }
    }
  }

  throw new Error('Could not generate a unique store code after 5 attempts');
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

/// The customer-facing lookup - active stores only, same as findPublicStores,
/// since an inactive store shouldn't be reachable by a shared link either.
async function findStoreByCode(code) {
  const [rows] = await db.execute(
    `
      SELECT *
      FROM stores
      WHERE public_code = ?
        AND is_active = TRUE
      LIMIT 1
    `,
    [code]
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

// `id` stays in this row for internal use - store-hours.service.js needs it
// to look up hours/closures for the open-state computation the service
// layer does over this list. It's the SERVICE layer's job (listPublicStores
// in stores.service.js) to strip id back out before this reaches an
// unauthenticated client - the numeric id is exactly what public_code
// exists to keep out of that response.
async function findPublicStores() {
  const [rows] = await db.execute(`
    SELECT id, public_code, name, address, phone, timezone
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

async function updateStore(storeId, fields) {
  const assignments = ['name = ?', 'address = ?', 'phone = ?'];
  const params = [fields.name, fields.address || null, fields.phone || null];

  // Only touch tax columns when the caller actually supplied them.
  if (fields.taxRate !== undefined) {
    assignments.push('tax_rate = ?');
    params.push(fields.taxRate);
  }

  if (fields.taxInclusive !== undefined) {
    assignments.push('tax_inclusive = ?');
    params.push(fields.taxInclusive ? 1 : 0);
  }

  // Only touch this when the caller actually supplied it, same reasoning.
  if (fields.minPrepMinutes !== undefined) {
    assignments.push('min_prep_minutes = ?');
    params.push(fields.minPrepMinutes);
  }

  if (fields.loyaltyEnabled !== undefined) {
    assignments.push('loyalty_enabled = ?');
    params.push(fields.loyaltyEnabled ? 1 : 0);
  }

  if (fields.loyaltyPointsPerDollar !== undefined) {
    assignments.push('loyalty_points_per_dollar = ?');
    params.push(fields.loyaltyPointsPerDollar);
  }

  if (fields.loyaltyPointValue !== undefined) {
    assignments.push('loyalty_point_value = ?');
    params.push(fields.loyaltyPointValue);
  }

  if (fields.loyaltyStackableWithCoupons !== undefined) {
    assignments.push('loyalty_stackable_with_coupons = ?');
    params.push(fields.loyaltyStackableWithCoupons ? 1 : 0);
  }

  params.push(storeId);

  const [result] = await db.execute(
    `UPDATE stores SET ${assignments.join(', ')} WHERE id = ?`,
    params
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
  regenerateStoreCode,
  findStoreById,
  findStoreByCode,
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
