const db = require('../config/db');

exports.createStore = async (req, res) => {
  try {
    const { name, address, phone } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Store name is required' });
    }

    const [result] = await db.execute(
      `INSERT INTO stores (name, address, phone)
       VALUES (?, ?, ?)`,
      [name, address || null, phone || null]
    );

    const [rows] = await db.execute(
      `SELECT * FROM stores WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({ store: rows[0] });
  } catch (error) {
    console.error('Create store error:', error);
    res.status(500).json({ message: 'Failed to create store', error: error.message });
  }
};

exports.listStores = async (_, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT * FROM stores ORDER BY created_at DESC`
    );
    res.json({ stores: rows });
  } catch (error) {
    console.error('List stores error:', error);
    res.status(500).json({ message: 'Failed to list stores', error: error.message });
  }
};