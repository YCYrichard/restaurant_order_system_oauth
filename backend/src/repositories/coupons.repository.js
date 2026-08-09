const db = require('../config/db');

const COUPON_COLUMNS = `
  id, code, store_id, discount_type, discount_value, min_order_total,
  max_redemptions, redemption_count, starts_at, expires_at, is_active,
  created_at
`;

async function findCouponByCode(code, connection = db) {
  const [rows] = await connection.execute(
    `
      SELECT ${COUPON_COLUMNS}
      FROM coupons
      WHERE code = ?
      LIMIT 1
    `,
    [code]
  );

  return rows[0] || null;
}

async function findCouponById(couponId) {
  const [rows] = await db.execute(
    `
      SELECT ${COUPON_COLUMNS}
      FROM coupons
      WHERE id = ?
      LIMIT 1
    `,
    [couponId]
  );

  return rows[0] || null;
}

async function findCouponsForStore(storeId) {
  const [rows] = await db.execute(
    `
      SELECT ${COUPON_COLUMNS}
      FROM coupons
      WHERE store_id = ?
         OR store_id IS NULL
      ORDER BY created_at DESC
    `,
    [storeId]
  );

  return rows;
}

async function insertCoupon(coupon) {
  const [result] = await db.execute(
    `
      INSERT INTO coupons (
        code, store_id, discount_type, discount_value, min_order_total,
        max_redemptions, starts_at, expires_at, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      coupon.code,
      coupon.storeId ?? null,
      coupon.discountType,
      coupon.discountValue,
      coupon.minOrderTotal ?? 0,
      coupon.maxRedemptions ?? null,
      coupon.startsAt ?? null,
      coupon.expiresAt ?? null,
      coupon.isActive === false ? false : true,
    ]
  );

  return result.insertId;
}

async function setCouponActive(couponId, isActive) {
  const [result] = await db.execute(
    `
      UPDATE coupons
      SET is_active = ?
      WHERE id = ?
    `,
    [isActive, couponId]
  );

  return result.affectedRows > 0;
}

async function deleteCoupon(couponId) {
  const [result] = await db.execute(
    `
      DELETE FROM coupons
      WHERE id = ?
    `,
    [couponId]
  );

  return result.affectedRows > 0;
}

async function countRedemptionsByUser(couponId, userId, connection = db) {
  const [rows] = await connection.execute(
    `
      SELECT COUNT(*) AS count
      FROM coupon_redemptions
      WHERE coupon_id = ?
        AND user_id = ?
    `,
    [couponId, userId]
  );

  return rows[0].count;
}

// Increments only while the coupon is still under its redemption cap, so
// two concurrent checkouts can't both slip past the last remaining use -
// the WHERE clause does the checking, not a prior read.
async function incrementRedemptionCount(couponId, connection = db) {
  const [result] = await connection.execute(
    `
      UPDATE coupons
      SET redemption_count = redemption_count + 1
      WHERE id = ?
        AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
    `,
    [couponId]
  );

  return result.affectedRows > 0;
}

async function insertRedemption(redemption, connection = db) {
  await connection.execute(
    `
      INSERT INTO coupon_redemptions (
        coupon_id, order_id, user_id, discount_amount
      )
      VALUES (?, ?, ?, ?)
    `,
    [
      redemption.couponId,
      redemption.orderId,
      redemption.userId ?? null,
      redemption.discountAmount,
    ]
  );
}

module.exports = {
  findCouponByCode,
  findCouponById,
  findCouponsForStore,
  insertCoupon,
  setCouponActive,
  deleteCoupon,
  countRedemptionsByUser,
  incrementRedemptionCount,
  insertRedemption,
};
