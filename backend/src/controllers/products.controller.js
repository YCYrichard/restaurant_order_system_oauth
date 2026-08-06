const db = require('../config/db');

exports.createProduct = async (req, res) => {
  try {
    const { storeId, categoryId, name, price, isActive } = req.body;

    if (!storeId || !name || price == null) {
      return res.status(400).json({ message: 'storeId, name and price are required' });
    }

    const [result] = await db.execute(
      `INSERT INTO products (store_id, category_id, name, price, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [storeId, categoryId || null, name, price, isActive ?? true]
    );

    const [rows] = await db.execute(
      `SELECT * FROM products WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({ product: rows[0] });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Failed to create product', error: error.message });
  }
};

exports.listProductsByStore = async (req, res) => {
  try {
    const storeId = req.params.storeId;

    const [rows] = await db.execute(
      `SELECT * FROM products
       WHERE store_id = ?
       ORDER BY id ASC`,
      [storeId]
    );

    res.json({ products: rows });
  } catch (error) {
    console.error('List products by store error:', error);
    res.status(500).json({ message: 'Failed to list products', error: error.message });
  }
};