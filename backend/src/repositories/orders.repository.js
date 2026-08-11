const db = require('../config/db');
const modifiersRepository = require('./modifiers.repository');

async function insertOrder(order, connection = db) {
  const [result] = await connection.execute(
    `
      INSERT INTO orders (
        user_id, store_id, total, subtotal, tax_amount, tax_rate,
        tax_inclusive, discount_amount, coupon_code,
        points_redeemed, points_discount_amount,
        customer_name, customer_phone, customer_email, notes,
        fulfillment_type, delivery_address, table_number, desired_ready_at,
        einvoice_status, einvoice_buyer_tax_id, einvoice_donate
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      order.userId || null,
      order.storeId,
      order.total,
      order.subtotal ?? order.total,
      order.taxAmount || 0,
      order.taxRate || 0,
      order.taxInclusive === false ? 0 : 1,
      order.discountAmount || 0,
      order.couponCode || null,
      order.pointsRedeemed || 0,
      order.pointsDiscountAmount || 0,
      order.customerName,
      order.customerPhone,
      order.customerEmail || null,
      order.notes || null,
      order.fulfillmentType || 'pickup',
      order.deliveryAddress || null,
      order.tableNumber || null,
      order.desiredReadyAt || null,
      order.einvoiceStatus || 'not_applicable',
      order.einvoiceBuyerTaxId || null,
      order.einvoiceDonate ? 1 : 0,
    ]
  );

  return result.insertId;
}

/// Inserts one row at a time and returns the new ids in order.
///
/// A single multi-row INSERT only reports its first insertId, and relying on
/// the rest being contiguous depends on innodb_autoinc_lock_mode - not
/// something to bet per-line modifier rows on. Orders carry a handful of
/// lines, so the extra round trips cost nothing.
async function insertOrderItems(orderId, items, connection = db) {
  const insertedIds = [];

  for (const item of items) {
    const [result] = await connection.execute(
      `
        INSERT INTO order_items (order_id, product_id, quantity, price, notes)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        orderId,
        item.productId,
        item.quantity,
        item.price,
        item.notes || null,
      ]
    );

    insertedIds.push(result.insertId);
  }

  return insertedIds;
}


/// Attaches each line's chosen options. Read from the snapshot columns, not
/// by joining live modifier tables - the order must keep showing what was
/// actually ordered even after the menu changes.
async function attachModifiers(items, connection = db) {
  if (items.length === 0) return items;

  const rows = await modifiersRepository.findModifiersForOrderItems(
    items.map((item) => item.id),
    connection
  );

  return items.map((item) => ({
    ...item,
    modifiers: rows
      .filter((row) => row.order_item_id === item.id)
      .map((row) => ({
        group_name: row.group_name,
        option_name: row.option_name,
        price_delta: row.price_delta,
      })),
  }));
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

  return { ...orderRows[0], items: await attachModifiers(items, connection) };
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

// Returns the caller's access_role for this store, or null with no grant -
// same contract as categories.repository.js:hasStoreAccess.
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

async function setPointsEarned(orderId, points, connection = db) {
  await connection.execute(
    `
      UPDATE orders
      SET points_earned = ?
      WHERE id = ?
    `,
    [points, orderId]
  );
}

async function setEinvoiceIssued(orderId, einvoiceNumber, connection = db) {
  const [result] = await connection.execute(
    `
      UPDATE orders
      SET einvoice_status = 'issued',
          einvoice_number = ?,
          einvoice_issued_at = NOW()
      WHERE id = ?
    `,
    [einvoiceNumber, orderId]
  );

  return result.affectedRows > 0;
}

async function setEinvoiceVoid(orderId, connection = db) {
  const [result] = await connection.execute(
    `
      UPDATE orders
      SET einvoice_status = 'void'
      WHERE id = ?
    `,
    [orderId]
  );

  return result.affectedRows > 0;
}

// activeOnly excludes completed/cancelled orders. The kitchen display
// polls this every few seconds and only cares about live tickets - without
// it, every poll drags the store's entire order history over the wire.
// Oldest-first for the kitchen, since the longest-waiting ticket is the
// most urgent; newest-first otherwise, which is what the admin list wants.
async function findOrdersByStore(storeId, { activeOnly = false } = {}) {
  const [orders] = await db.execute(
    `
      SELECT o.*, s.name AS store_name
      FROM orders o
      LEFT JOIN stores s ON o.store_id = s.id
      WHERE o.store_id = ?
        ${activeOnly ? "AND o.status NOT IN ('completed', 'cancelled')" : ''}
      ORDER BY o.created_at ${activeOnly ? 'ASC' : 'DESC'}
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

      return { ...order, items: await attachModifiers(items) };
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

      return { ...order, items: await attachModifiers(items) };
    })
  );
}

async function insertRefund(refund, connection = db) {
  const [result] = await connection.execute(
    `
      INSERT INTO order_refunds (
        order_id, amount, reason, provider_transaction_id, created_by
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      refund.orderId,
      refund.amount,
      refund.reason || null,
      refund.providerTransactionId || null,
      refund.createdBy || null,
    ]
  );

  return result.insertId;
}

async function findRefundsForOrder(orderId) {
  const [rows] = await db.execute(
    `
      SELECT id, amount, reason, provider_transaction_id, created_by, created_at
      FROM order_refunds
      WHERE order_id = ?
      ORDER BY created_at ASC
    `,
    [orderId]
  );

  return rows;
}

async function sumRefundsForOrder(orderId, connection = db) {
  const [rows] = await connection.execute(
    `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM order_refunds
      WHERE order_id = ?
    `,
    [orderId]
  );

  return Number(rows[0].total);
}

// Takes an exclusive row lock on the order within an open transaction, so
// two concurrent refund requests on the same order serialize instead of
// both reading the same pre-refund "remaining balance" and both succeeding
// (which would let cumulative refunds exceed the order total). Must be
// called with a transaction connection, never the bare pool.
async function lockOrderRow(orderId, connection) {
  const [rows] = await connection.execute(
    `
      SELECT id, total
      FROM orders
      WHERE id = ?
      FOR UPDATE
    `,
    [orderId]
  );

  return rows[0] || null;
}

module.exports = {
  insertOrder,
  insertRefund,
  findRefundsForOrder,
  sumRefundsForOrder,
  lockOrderRow,
  insertOrderItems,
  findOrderWithItems,
  findOrdersByUser,
  findOrderById,
  hasStoreAccess,
  updateOrderStatus,
  setPointsEarned,
  setEinvoiceIssued,
  setEinvoiceVoid,
  findOrdersByStore,
};
