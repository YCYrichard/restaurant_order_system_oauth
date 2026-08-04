const db = require('../config/db');

exports.createOrder = async (req, res) => {
  try {
    const {
      userId,
      storeId,
      items,
      total,
      customerName,
      customerPhone,
      customerEmail,
      notes
    } = req.body;

    if (!storeId || !items || !Array.isArray(items) || items.length === 0 || !total || !customerName || !customerPhone) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const [orderResult] = await db.execute(
      `INSERT INTO orders (
        user_id, store_id, total, customer_name, customer_phone, customer_email, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        storeId,
        total,
        customerName,
        customerPhone,
        customerEmail || null,
        notes || null
      ]
    );

    const orderId = orderResult.insertId;

    const itemValues = items.map(item => [
      orderId,
      item.productId,
      item.quantity,
      item.price
    ]);

    await db.execute(
      `INSERT INTO order_items (order_id, product_id, quantity, price)
       VALUES ?`,
      [itemValues]
    );

    const [orderRows] = await db.execute(
      `SELECT o.*, s.name as store_name
       FROM orders o
       LEFT JOIN stores s ON o.store_id = s.id
       WHERE o.id = ?`,
      [orderId]
    );

    const [itemRows] = await db.execute(
      `SELECT oi.*, p.name as product_name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    res.status(201).json({
      message: 'Order created',
      order: {
        ...orderRows[0],
        items: itemRows
      }
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      message: 'Failed to create order',
      error: error.message
    });
  }
};

exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.params.userId;

    const [orders] = await db.execute(
      `SELECT o.*, s.name as store_name
       FROM orders o
       LEFT JOIN stores s ON o.store_id = s.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [userId]
    );

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const [items] = await db.execute(
          `SELECT oi.*, p.name as product_name
           FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = ?`,
          [order.id]
        );
        return { ...order, items };
      })
    );

    res.json({ orders: ordersWithItems });
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({
      message: 'Failed to get orders',
      error: error.message
    });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const [orderRows] = await db.execute(
      `SELECT o.*, s.name as store_name
       FROM orders o
       LEFT JOIN stores s ON o.store_id = s.id
       WHERE o.id = ?`,
      [orderId]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const [items] = await db.execute(
      `SELECT oi.*, p.name as product_name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    res.json({
      order: {
        ...orderRows[0],
        items
      }
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      message: 'Failed to get order',
      error: error.message
    });
  }
};