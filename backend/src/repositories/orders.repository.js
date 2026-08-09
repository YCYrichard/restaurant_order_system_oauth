const db = require('../config/db');

async function insertOrder(order, connection = db) {
  const [result] = await connection.execute(
    `
      INSERT INTO orders (
        user_id, store_id, total, customer_name, customer_phone, customer_email, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      order.userId || null,
      order.storeId,
      order.total,
      order.customerName,
      order.customerPhone,
      order.customerEmail || null,
      order.notes || null,
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
  ]);

  const placeholders = itemValues.map(() => '(?, ?, ?, ?)').join(', ');
  const flatValues = itemValues.flat();

  await connection.execute(
    `
      INSERT INTO order_items (order_id, product_id, quantity, price)
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
};
