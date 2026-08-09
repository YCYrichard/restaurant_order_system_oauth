const db = require('../config/db');

async function insertOrder(order, connection = db) {
  const [result] = await connection.execute(
    `
      INSERT INTO orders (
        user_id, store_id, total, discount_amount, coupon_code,
        customer_name, customer_phone, customer_email, notes,
        fulfillment_type, delivery_address, table_number
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      order.userId || null,
      order.storeId,
      order.total,
      order.discountAmount || 0,
      order.couponCode || null,
      order.customerName,
      order.customerPhone,
      order.customerEmail || null,
      order.notes || null,
      order.fulfillmentType || 'pickup',
      order.deliveryAddress || null,
      order.tableNumber || null,
    ]
  );

  return result.insertId;
}

async function insertOrderItems(orderId, items, connection = db) {
  const itemValues = items.map((item) => [
    orderId,
    item.productId,
    item.quantity,
    item.price,
    item.notes || null,
  ]);

  const placeholders = itemValues.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const flatValues = itemValues.flat();

  await connection.execute(
    `
      INSERT INTO order_items (order_id, product_id, quantity, price, notes)
      VALUES ${placeholders}
    `,
    flatValues
  );
}

async function findOrderWithItems(orderId, connection = db) {
  const [orderRows] = await connection.execute(
    `
      SELECT o.*, s.name AS store_name
      FROM orders o
      LEFT JOIN stores s ON o.store_id = s.id
      WHERE o.id = ?
    `,
    [orderId]
  );

  if (orderRows.length === 0) {
    return null;
  }

  const [items] = await connection.execute(
    `
      SELECT oi.*, p.name AS product_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `,
    [orderId]
  );

  return { ...orderRows[0], items };
}

async function findOrderById(orderId) {
  const [rows] = await db.execute(
    `
      SELECT *
      FROM orders
      WHERE id = ?
      LIMIT 1
    `,
    [orderId]
  );

  return rows[0] || null;
}

async function hasStoreAccess(userId, storeId) {
  const [rows] = await db.execute(
    `
      SELECT id
      FROM owner_store_access
      WHERE user_id = ?
        AND store_id = ?
      LIMIT 1
    `,
    [userId, storeId]
  );

  return rows.length > 0;
}

async function updateOrderStatus(orderId, status) {
  const [result] = await db.execute(
    `
      UPDATE orders
      SET status = ?
      WHERE id = ?
    `,
    [status, orderId]
  );

  return result.affectedRows > 0;
}

async function findOrdersByStore(storeId) {
  const [orders] = await db.execute(
    `
      SELECT o.*, s.name AS store_name
      FROM orders o
      LEFT JOIN stores s ON o.store_id = s.id
      WHERE o.store_id = ?
      ORDER BY o.created_at DESC
    `,
    [storeId]
  );

  return Promise.all(
    orders.map(async (order) => {
      const [items] = await db.execute(
        `
          SELECT oi.*, p.name AS product_name
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          WHERE oi.order_id = ?
        `,
        [order.id]
      );

      return { ...order, items };
    })
  );
}

async function findOrdersByUser(userId) {
  const [orders] = await db.execute(
    `
      SELECT o.*, s.name AS store_name
      FROM orders o
      LEFT JOIN stores s ON o.store_id = s.id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `,
    [userId]
  );

  return Promise.all(
    orders.map(async (order) => {
      const [items] = await db.execute(
        `
          SELECT oi.*, p.name AS product_name
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          WHERE oi.order_id = ?
        `,
        [order.id]
      );

      return { ...order, items };
    })
  );
}

module.exports = {
  insertOrder,
  insertOrderItems,
  findOrderWithItems,
  findOrdersByUser,
  findOrderById,
  hasStoreAccess,
  updateOrderStatus,
  findOrdersByStore,
};
