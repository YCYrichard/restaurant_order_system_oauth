const db = require('../config/db');

exports.listProductsByStore = async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);

    const [rows] = await db.execute(
      `
        SELECT
          p.id,
          p.store_id,
          p.category_id,
          p.name,
          p.description,
          p.price,
          p.is_active,
          p.created_at,
          p.updated_at,
          c.name AS category_name
        FROM products p
        LEFT JOIN categories c
          ON c.id = p.category_id
        WHERE p.store_id = ?
        ORDER BY p.created_at DESC
      `,
      [storeId]
    );

    return res.status(200).json({
      products: rows,
    });
  } catch (error) {
    console.error('List products error:', error);

    return res.status(500).json({
      message: 'Failed to list products',
    });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);

    const name =
      typeof req.body.name === 'string'
        ? req.body.name.trim()
        : '';

    const description =
      typeof req.body.description === 'string'
        ? req.body.description.trim()
        : null;

    const price = Number(req.body.price);

    const categoryId = req.body.categoryId
      ? Number(req.body.categoryId)
      : null;

    if (!name) {
      return res.status(400).json({
        message: 'Product name is required',
      });
    }

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        message: 'Product price must be a valid positive number',
      });
    }

    if (categoryId !== null) {
      const [categoryRows] = await db.execute(
        `
          SELECT id
          FROM categories
          WHERE id = ?
            AND store_id = ?
          LIMIT 1
        `,
        [categoryId, storeId]
      );

      if (categoryRows.length === 0) {
        return res.status(400).json({
          message: 'Category does not belong to this store',
        });
      }
    }

    const [result] = await db.execute(
      `
        INSERT INTO products (
          store_id,
          category_id,
          name,
          description,
          price,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, TRUE)
      `,
      [
        storeId,
        categoryId,
        name,
        description || null,
        price,
      ]
    );

    const [rows] = await db.execute(
      `
        SELECT *
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json({
      product: rows[0],
    });
  } catch (error) {
    console.error('Create product error:', error);

    return res.status(500).json({
      message: 'Failed to create product',
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const productId = Number(req.params.productId);

    const name =
      typeof req.body.name === 'string'
        ? req.body.name.trim()
        : '';

    const description =
      typeof req.body.description === 'string'
        ? req.body.description.trim()
        : null;

    const price = Number(req.body.price);

    const categoryId = req.body.categoryId
      ? Number(req.body.categoryId)
      : null;

    if (!name) {
      return res.status(400).json({
        message: 'Product name is required',
      });
    }

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        message: 'Product price must be a valid positive number',
      });
    }

    const [productRows] = await db.execute(
      `
        SELECT store_id
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [productId]
    );

    if (productRows.length === 0) {
      return res.status(404).json({
        message: 'Product not found',
      });
    }

    const storeId = productRows[0].store_id;

    if (categoryId !== null) {
      const [categoryRows] = await db.execute(
        `
          SELECT id
          FROM categories
          WHERE id = ?
            AND store_id = ?
          LIMIT 1
        `,
        [categoryId, storeId]
      );

      if (categoryRows.length === 0) {
        return res.status(400).json({
          message: 'Category does not belong to this store',
        });
      }
    }

    const [result] = await db.execute(
      `
        UPDATE products
        SET
          category_id = ?,
          name = ?,
          description = ?,
          price = ?
        WHERE id = ?
      `,
      [
        categoryId,
        name,
        description || null,
        price,
        productId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Product not found',
      });
    }

    const [rows] = await db.execute(
      `
        SELECT *
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [productId]
    );

    return res.status(200).json({
      product: rows[0],
    });
  } catch (error) {
    console.error('Update product error:', error);

    return res.status(500).json({
      message: 'Failed to update product',
    });
  }
};

exports.updateProductStatus = async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const isActive = Boolean(req.body.isActive);

    const [result] = await db.execute(
      `
        UPDATE products
        SET is_active = ?
        WHERE id = ?
      `,
      [isActive, productId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Product not found',
      });
    }

    const [rows] = await db.execute(
      `
        SELECT *
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [productId]
    );

    return res.status(200).json({
      product: rows[0],
    });
  } catch (error) {
    console.error('Update product status error:', error);

    return res.status(500).json({
      message: 'Failed to update product status',
    });
  }
};