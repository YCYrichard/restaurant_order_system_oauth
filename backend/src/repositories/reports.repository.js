const db = require('../config/db');

// Every query here returns raw rows with their own `created_at`, rather than
// pre-aggregating in SQL. Reports need to bucket by the STORE'S local date
// and hour (a 11pm order and a 1am order can be the same local evening
// depending on timezone), and MySQL's CONVERT_TZ needs a timezone table
// this install may not have loaded - reports.service buckets in JS with the
// same Intl-based approach store-hours.service already uses for "is this
// store open right now". The window passed in here is intentionally padded
// by a day on each side so no local-date order is cut off at the UTC edge;
// the service trims to the exact range after bucketing.

async function findCompletedOrdersForReport(storeId, { fromUtc, toUtc }) {
  const [rows] = await db.execute(
    `
      SELECT id, total, fulfillment_type, created_at
      FROM orders
      WHERE store_id = ?
        AND status = 'completed'
        AND created_at >= ?
        AND created_at < ?
    `,
    [storeId, fromUtc, toUtc]
  );

  return rows;
}

async function findRefundsForReport(storeId, { fromUtc, toUtc }) {
  const [rows] = await db.execute(
    `
      SELECT r.id, r.amount, r.created_at
      FROM order_refunds r
      INNER JOIN orders o ON o.id = r.order_id
      WHERE o.store_id = ?
        AND r.created_at >= ?
        AND r.created_at < ?
    `,
    [storeId, fromUtc, toUtc]
  );

  return rows;
}

/// One row per order line (not pre-aggregated by product) so the service can
/// filter to each line's local date before summing - aggregating in SQL
/// first would bake in the padded window's slop at the edges.
async function findItemRowsForReport(storeId, { fromUtc, toUtc }) {
  const [rows] = await db.execute(
    `
      SELECT
        oi.product_id AS productId,
        p.name AS productName,
        oi.quantity AS quantity,
        oi.price AS price,
        o.created_at AS createdAt
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.store_id = ?
        AND o.status = 'completed'
        AND o.created_at >= ?
        AND o.created_at < ?
    `,
    [storeId, fromUtc, toUtc]
  );

  return rows;
}

module.exports = {
  findCompletedOrdersForReport,
  findRefundsForReport,
  findItemRowsForReport,
};
