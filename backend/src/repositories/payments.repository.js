const db = require('../config/db');

async function insertPayment({
  orderId,
  provider,
  providerTransactionId,
  amount,
  currency,
  status,
  method,
  rawResponse,
}) {
  const [result] = await db.execute(
    `
      INSERT INTO payments (
        order_id, provider, provider_transaction_id,
        amount, currency, status, method, raw_response
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      orderId,
      provider,
      providerTransactionId || null,
      amount,
      currency,
      status,
      method || null,
      rawResponse ? JSON.stringify(rawResponse) : null,
    ]
  );

  return result.insertId;
}

async function findPaymentsForOrder(orderId) {
  const [rows] = await db.execute(
    `
      SELECT id, provider, provider_transaction_id, amount, currency,
             status, method, created_at
      FROM payments
      WHERE order_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    [orderId]
  );

  return rows;
}

/// The most recent successful charge, which is what a refund must be issued
/// against - the gateway needs the transaction id of the charge, not of a
/// failed attempt.
async function findLatestPaidPayment(orderId) {
  const [rows] = await db.execute(
    `
      SELECT *
      FROM payments
      WHERE order_id = ?
        AND status = 'paid'
      ORDER BY id DESC
      LIMIT 1
    `,
    [orderId]
  );

  return rows[0] || null;
}

async function sumPaidForOrder(orderId) {
  const [rows] = await db.execute(
    `
      SELECT COALESCE(SUM(amount), 0) AS paid
      FROM payments
      WHERE order_id = ?
        AND status = 'paid'
    `,
    [orderId]
  );

  return Number(rows[0].paid);
}

async function updatePaymentStatus(paymentId, status) {
  await db.execute('UPDATE payments SET status = ? WHERE id = ?', [
    status,
    paymentId,
  ]);
}

async function updateOrderPaymentStatus(orderId, paymentStatus) {
  await db.execute('UPDATE orders SET payment_status = ? WHERE id = ?', [
    paymentStatus,
    orderId,
  ]);
}

module.exports = {
  insertPayment,
  findPaymentsForOrder,
  findLatestPaidPayment,
  sumPaidForOrder,
  updatePaymentStatus,
  updateOrderPaymentStatus,
};
