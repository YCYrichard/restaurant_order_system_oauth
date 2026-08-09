'use strict';

// Coupons are scoped to a store (store_id NULL = valid at every store).
// Discounts are either a percentage or a fixed amount; the *resolved*
// discount and the coupon used are recorded on the order so a later change
// to the coupon definition can't retroactively rewrite what a customer was
// actually charged.
//
// coupon_redemptions exists so per-user usage limits can be enforced and so
// redemptions are auditable independently of the orders table.

function columnExists(db, table, column) {
  return db
    .runSql(
      `
        SELECT COUNT(*) AS count
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name = ?
      `,
      [table, column]
    )
    .then((result) => result[0].count > 0);
}

function addColumnIfMissing(db, table, column, columnDdl) {
  return columnExists(db, table, column).then((exists) => {
    if (exists) {
      return null;
    }
    return db.runSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnDdl}`);
  });
}

function dropColumnIfPresent(db, table, column) {
  return columnExists(db, table, column).then((exists) => {
    if (!exists) {
      return null;
    }
    return db.runSql(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  });
}

exports.up = function (db) {
  return db
    .runSql(
      `
        CREATE TABLE IF NOT EXISTS coupons (
          id INT AUTO_INCREMENT PRIMARY KEY,
          code VARCHAR(40) NOT NULL,
          store_id INT NULL,
          discount_type ENUM('percent', 'fixed') NOT NULL,
          discount_value DECIMAL(10,2) NOT NULL,
          min_order_total DECIMAL(10,2) NOT NULL DEFAULT 0,
          max_redemptions INT NULL,
          redemption_count INT NOT NULL DEFAULT 0,
          starts_at TIMESTAMP NULL,
          expires_at TIMESTAMP NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_coupon_code (code),
          KEY idx_coupons_store_id (store_id),
          CONSTRAINT fk_coupons_store FOREIGN KEY (store_id)
            REFERENCES stores(id) ON DELETE CASCADE
        )
      `
    )
    .then(() =>
      db.runSql(
        `
          CREATE TABLE IF NOT EXISTS coupon_redemptions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            coupon_id INT NOT NULL,
            order_id INT NOT NULL,
            user_id INT NULL,
            discount_amount DECIMAL(10,2) NOT NULL,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_redemptions_coupon_id (coupon_id),
            KEY idx_redemptions_user_id (user_id),
            CONSTRAINT fk_redemptions_coupon FOREIGN KEY (coupon_id)
              REFERENCES coupons(id) ON DELETE CASCADE,
            CONSTRAINT fk_redemptions_order FOREIGN KEY (order_id)
              REFERENCES orders(id) ON DELETE CASCADE,
            CONSTRAINT fk_redemptions_user FOREIGN KEY (user_id)
              REFERENCES users(id) ON DELETE SET NULL
          )
        `
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'discount_amount',
        'DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'coupon_code',
        'VARCHAR(40) NULL AFTER discount_amount'
      )
    );
};

exports.down = function (db) {
  return dropColumnIfPresent(db, 'orders', 'coupon_code')
    .then(() => dropColumnIfPresent(db, 'orders', 'discount_amount'))
    .then(() => db.runSql('DROP TABLE IF EXISTS coupon_redemptions'))
    .then(() => db.runSql('DROP TABLE IF EXISTS coupons'));
};

exports._meta = {
  version: 1,
};
