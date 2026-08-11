const db = require('../config/db');

async function findCategoriesByStore(storeId) {
  const [rows] = await db.execute(
    `
      SELECT id, store_id, name, sort_order
      FROM categories
      WHERE store_id = ?
      ORDER BY sort_order ASC, name ASC
    `,
    [storeId]
  );

  return rows;
}

async function findCategoryById(categoryId) {
  const [rows] = await db.execute(
    `
      SELECT id, store_id, name, sort_order
      FROM categories
      WHERE id = ?
      LIMIT 1
    `,
    [categoryId]
  );

  return rows[0] || null;
}

// Returns the caller's access_role for this store ('owner'/'manager'/
// 'staff'), or null if they have no grant at all. A truthy return still
// reads correctly wherever a caller only checks "has access" (any tier is
// truthy) - callers that need to distinguish tiers use the value directly.
async function hasStoreAccess(userId, storeId) {
  const [rows] = await db.execute(
    `
      SELECT access_role
      FROM owner_store_access
      WHERE user_id = ?
        AND store_id = ?
      LIMIT 1
    `,
    [userId, storeId]
  );

  return rows[0]?.access_role ?? null;
}

async function insertCategory(storeId, { name, sortOrder }) {
  const [result] = await db.execute(
    `
      INSERT INTO categories (store_id, name, sort_order)
      VALUES (?, ?, ?)
    `,
    [storeId, name, sortOrder]
  );

  return result.insertId;
}

async function updateCategory(categoryId, { name, sortOrder }) {
  await db.execute(
    `
      UPDATE categories
      SET name = ?, sort_order = ?
      WHERE id = ?
    `,
    [name, sortOrder, categoryId]
  );
}

async function countProductsInCategory(categoryId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS count
      FROM products
      WHERE category_id = ?
    `,
    [categoryId]
  );

  return rows[0].count;
}

async function deleteCategory(categoryId) {
  const [result] = await db.execute(
    `
      DELETE FROM categories
      WHERE id = ?
    `,
    [categoryId]
  );

  return result.affectedRows > 0;
}

module.exports = {
  findCategoriesByStore,
  findCategoryById,
  hasStoreAccess,
  insertCategory,
  updateCategory,
  countProductsInCategory,
  deleteCategory,
};
