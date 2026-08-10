const db = require('../config/db');

/// Looks up the authoritative price and availability for a set of products,
/// scoped to one store. Order creation uses this instead of trusting the
/// price the client submitted.
async function findProductsByIds(storeId, productIds, connection = db) {
  if (productIds.length === 0) {
    return [];
  }

  // Placeholders are generated from the array length, and every value is
  // still bound - no interpolation of caller data into the SQL.
  const placeholders = productIds.map(() => '?').join(', ');

  const [rows] = await connection.execute(
    `
      SELECT
        id, store_id, name, price, is_active, unavailable_until,
        (unavailable_until IS NOT NULL AND unavailable_until > NOW())
          AS is_eighty_sixed
      FROM products
      WHERE store_id = ?
        AND id IN (${placeholders})
    `,
    [storeId, ...productIds]
  );

  return rows;
}

module.exports = {
  findProductsByIds,
};
