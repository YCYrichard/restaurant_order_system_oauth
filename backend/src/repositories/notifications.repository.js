const db = require('../config/db');

async function logAttempt({ orderId, channel, status, error }) {
  await db.execute(
    `
      INSERT INTO notification_log (order_id, channel, status, error)
      VALUES (?, ?, ?, ?)
    `,
    [orderId, channel, status, error ? String(error).slice(0, 500) : null]
  );
}

async function findLogForOrder(orderId) {
  const [rows] = await db.execute(
    `
      SELECT id, channel, status, error, created_at
      FROM notification_log
      WHERE order_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    [orderId]
  );

  return rows;
}

module.exports = {
  logAttempt,
  findLogForOrder,
};
