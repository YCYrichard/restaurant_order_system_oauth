const db = require('../config/db');

exports.createStore = async (req, res) => {
  try {
    const name =
      typeof req.body.name === 'string'
        ? req.body.name.trim()
        : '';

    const address =
      typeof req.body.address === 'string'
        ? req.body.address.trim()
        : null;

    const phone =
      typeof req.body.phone === 'string'
        ? req.body.phone.trim()
        : null;

    if (!name) {
      return res.status(400).json({
        message: 'Store name is required',
      });
    }

    const [result] = await db.execute(
      `
        INSERT INTO stores (
          name,
          address,
          phone,
          is_active
        )
        VALUES (?, ?, ?, TRUE)
      `,
      [name, address || null, phone || null]
    );

    const [rows] = await db.execute(
      `
        SELECT *
        FROM stores
        WHERE id = ?
        LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json({
      store: rows[0],
    });
  } catch (error) {
    console.error('Create store error:', error);

    return res.status(500).json({
      message: 'Failed to create store',
    });
  }
};

exports.listStores = async (req, res) => {
  try {
    let rows;

    if (req.user.role === 'admin') {
      const [adminRows] = await db.execute(
        `
          SELECT
            s.*,
            COUNT(DISTINCT p.id) AS product_count
          FROM stores s
          LEFT JOIN products p
            ON p.store_id = s.id
          GROUP BY s.id
          ORDER BY s.created_at DESC
        `
      );

      rows = adminRows;
    } else {
      const [ownerRows] = await db.execute(
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
        [req.user.id]
      );

      rows = ownerRows;
    }

    return res.status(200).json({
      stores: rows,
    });
  } catch (error) {
    console.error('List stores error:', error);

    return res.status(500).json({
      message: 'Failed to list stores',
    });
  }
};

exports.getStore = async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);

    const [rows] = await db.execute(
      `
        SELECT *
        FROM stores
        WHERE id = ?
        LIMIT 1
      `,
      [storeId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Store not found',
      });
    }

    return res.status(200).json({
      store: rows[0],
    });
  } catch (error) {
    console.error('Get store error:', error);

    return res.status(500).json({
      message: 'Failed to load store',
    });
  }
};

exports.updateStore = async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);

    const name =
      typeof req.body.name === 'string'
        ? req.body.name.trim()
        : '';

    const address =
      typeof req.body.address === 'string'
        ? req.body.address.trim()
        : null;

    const phone =
      typeof req.body.phone === 'string'
        ? req.body.phone.trim()
        : null;

    if (!name) {
      return res.status(400).json({
        message: 'Store name is required',
      });
    }

    const [result] = await db.execute(
      `
        UPDATE stores
        SET
          name = ?,
          address = ?,
          phone = ?
        WHERE id = ?
      `,
      [
        name,
        address || null,
        phone || null,
        storeId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Store not found',
      });
    }

    const [rows] = await db.execute(
      `
        SELECT *
        FROM stores
        WHERE id = ?
        LIMIT 1
      `,
      [storeId]
    );

    return res.status(200).json({
      store: rows[0],
    });
  } catch (error) {
    console.error('Update store error:', error);

    return res.status(500).json({
      message: 'Failed to update store',
    });
  }
};

exports.updateStoreStatus = async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);
    const isActive = Boolean(req.body.isActive);

    const [result] = await db.execute(
      `
        UPDATE stores
        SET is_active = ?
        WHERE id = ?
      `,
      [isActive, storeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Store not found',
      });
    }

    const [rows] = await db.execute(
      `
        SELECT *
        FROM stores
        WHERE id = ?
        LIMIT 1
      `,
      [storeId]
    );

    return res.status(200).json({
      store: rows[0],
    });
  } catch (error) {
    console.error('Update store status error:', error);

    return res.status(500).json({
      message: 'Failed to update store status',
    });
  }
};