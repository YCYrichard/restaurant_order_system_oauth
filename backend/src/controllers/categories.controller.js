const db = require('../config/db');

// Update/delete are addressed by categoryId alone (no storeId in the URL),
// so resolve the owning store here and verify access explicitly - the
// requireStoreAccess middleware only works when storeId is already in
// req.params.
async function resolveCategoryAccess(categoryId, user) {
  const [rows] = await db.execute(
    `
      SELECT store_id
      FROM categories
      WHERE id = ?
      LIMIT 1
    `,
    [categoryId]
  );

  if (rows.length === 0) {
    return { error: { status: 404, message: 'Category not found' } };
  }

  const storeId = rows[0].store_id;

  if (user.role === 'admin') {
    return { storeId };
  }

  const [accessRows] = await db.execute(
    `
      SELECT id
      FROM owner_store_access
      WHERE user_id = ?
        AND store_id = ?
      LIMIT 1
    `,
    [user.id, storeId]
  );

  if (accessRows.length === 0) {
    return {
      error: { status: 403, message: 'You do not have access to this store' },
    };
  }

  return { storeId };
}

exports.listCategoriesByStore = async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);

    const [rows] = await db.execute(
      `
        SELECT id, store_id, name, sort_order
        FROM categories
        WHERE store_id = ?
        ORDER BY sort_order ASC, name ASC
      `,
      [storeId]
    );

    return res.status(200).json({
      categories: rows,
    });
  } catch (error) {
    console.error('List categories error:', error);

    return res.status(500).json({
      message: 'Failed to list categories',
    });
  }
};

// Public listing used by the customer-facing menu, so it can group
// products by real category instead of a hardcoded string.
exports.listPublicCategoriesByStore = async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);

    const [rows] = await db.execute(
      `
        SELECT id, store_id, name, sort_order
        FROM categories
        WHERE store_id = ?
        ORDER BY sort_order ASC, name ASC
      `,
      [storeId]
    );

    return res.status(200).json({
      categories: rows,
    });
  } catch (error) {
    console.error('List public categories error:', error);

    return res.status(500).json({
      message: 'Failed to list categories',
    });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);

    const name =
      typeof req.body.name === 'string'
        ? req.body.name.trim()
        : '';

    const sortOrder = Number.isFinite(Number(req.body.sortOrder))
      ? Number(req.body.sortOrder)
      : 0;

    if (!name) {
      return res.status(400).json({
        message: 'Category name is required',
      });
    }

    const [result] = await db.execute(
      `
        INSERT INTO categories (store_id, name, sort_order)
        VALUES (?, ?, ?)
      `,
      [storeId, name, sortOrder]
    );

    const [rows] = await db.execute(
      `
        SELECT id, store_id, name, sort_order
        FROM categories
        WHERE id = ?
        LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json({
      category: rows[0],
    });
  } catch (error) {
    console.error('Create category error:', error);

    return res.status(500).json({
      message: 'Failed to create category',
    });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const categoryId = Number(req.params.categoryId);

    const access = await resolveCategoryAccess(categoryId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({
        message: access.error.message,
      });
    }

    const name =
      typeof req.body.name === 'string'
        ? req.body.name.trim()
        : '';

    const sortOrder = Number.isFinite(Number(req.body.sortOrder))
      ? Number(req.body.sortOrder)
      : 0;

    if (!name) {
      return res.status(400).json({
        message: 'Category name is required',
      });
    }

    await db.execute(
      `
        UPDATE categories
        SET name = ?, sort_order = ?
        WHERE id = ?
      `,
      [name, sortOrder, categoryId]
    );

    const [rows] = await db.execute(
      `
        SELECT id, store_id, name, sort_order
        FROM categories
        WHERE id = ?
        LIMIT 1
      `,
      [categoryId]
    );

    return res.status(200).json({
      category: rows[0],
    });
  } catch (error) {
    console.error('Update category error:', error);

    return res.status(500).json({
      message: 'Failed to update category',
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const categoryId = Number(req.params.categoryId);

    const access = await resolveCategoryAccess(categoryId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({
        message: access.error.message,
      });
    }

    const [productRows] = await db.execute(
      `
        SELECT COUNT(*) AS count
        FROM products
        WHERE category_id = ?
      `,
      [categoryId]
    );

    if (productRows[0].count > 0) {
      return res.status(409).json({
        message:
          'Cannot delete a category that still has products assigned to it. Reassign or remove those products first.',
      });
    }

    const [result] = await db.execute(
      `
        DELETE FROM categories
        WHERE id = ?
      `,
      [categoryId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Category not found',
      });
    }

    return res.status(200).json({
      message: 'Category deleted',
    });
  } catch (error) {
    console.error('Delete category error:', error);

    return res.status(500).json({
      message: 'Failed to delete category',
    });
  }
};
