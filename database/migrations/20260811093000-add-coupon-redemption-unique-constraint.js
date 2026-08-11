'use strict';

// coupons.repository.js:countRedemptionsByUser is a plain SELECT COUNT with
// no locking read, and there was no DB-level backstop behind it - two
// concurrent checkouts presenting the same one-per-user coupon could both
// pass the application-level check and both redeem before either commit.
// This adds the UNIQUE constraint that check was missing, so the database
// itself rejects the race regardless of application-level timing. Every
// order requires authentication (orders.routes.js: POST / is requireAuth
// only, no guest checkout), so user_id is never NULL on a redemption row in
// practice - MySQL's "NULLs don't collide in a unique index" behavior is a
// non-issue here.

function indexExists(db, table, indexName) {
  return db
    .runSql(
      `
        SELECT COUNT(*) AS count
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND index_name = ?
      `,
      [table, indexName]
    )
    .then((result) => result[0].count > 0);
}

exports.up = async function (db) {
  // Defensive: collapse any pre-existing duplicate (coupon_id, user_id)
  // pairs down to the earliest redemption before the constraint is added,
  // so this migration can't fail against data that already has the bug it
  // fixes.
  await db.runSql(`
    DELETE r1 FROM coupon_redemptions r1
    INNER JOIN coupon_redemptions r2
      ON r1.coupon_id = r2.coupon_id
      AND r1.user_id = r2.user_id
      AND r1.user_id IS NOT NULL
      AND r1.id > r2.id
  `);

  const hasUniqueIndex = await indexExists(
    db,
    'coupon_redemptions',
    'unique_coupon_redemption_per_user'
  );

  if (!hasUniqueIndex) {
    await db.runSql(
      'ALTER TABLE coupon_redemptions ADD UNIQUE KEY unique_coupon_redemption_per_user (coupon_id, user_id)'
    );
  }
};

exports.down = async function (db) {
  const hasUniqueIndex = await indexExists(
    db,
    'coupon_redemptions',
    'unique_coupon_redemption_per_user'
  );

  if (hasUniqueIndex) {
    await db.runSql(
      'ALTER TABLE coupon_redemptions DROP INDEX unique_coupon_redemption_per_user'
    );
  }
};

exports._meta = {
  version: 1,
};
