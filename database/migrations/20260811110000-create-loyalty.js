'use strict';

// Loyalty points, per store (each restaurant's earn rate is its own
// business decision, same reasoning as tax_rate/hours already being
// per-store). loyalty_ledger is the append-only record of truth;
// loyalty_accounts.balance is a denormalised cache kept in sync in the same
// statement group as every ledger insert - same shape as
// coupons.redemption_count (cache) + coupon_redemptions (ledger).

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
        CREATE TABLE IF NOT EXISTS loyalty_accounts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          store_id INT NOT NULL,
          balance INT NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
            ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_loyalty_account (user_id, store_id),
          KEY idx_loyalty_accounts_store (store_id),
          CONSTRAINT fk_loyalty_accounts_user FOREIGN KEY (user_id)
            REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_loyalty_accounts_store FOREIGN KEY (store_id)
            REFERENCES stores(id) ON DELETE CASCADE
        )
      `
    )
    .then(() =>
      db.runSql(
        `
          CREATE TABLE IF NOT EXISTS loyalty_ledger (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            store_id INT NOT NULL,
            order_id INT NULL,
            type ENUM('earn', 'redeem', 'earn_reversal', 'redeem_reversal', 'adjustment')
              NOT NULL,
            points_delta INT NOT NULL,
            description VARCHAR(255) NULL,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_loyalty_ledger_account (user_id, store_id),
            KEY idx_loyalty_ledger_order (order_id),
            CONSTRAINT fk_loyalty_ledger_user FOREIGN KEY (user_id)
              REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_loyalty_ledger_store FOREIGN KEY (store_id)
              REFERENCES stores(id) ON DELETE CASCADE,
            CONSTRAINT fk_loyalty_ledger_order FOREIGN KEY (order_id)
              REFERENCES orders(id) ON DELETE SET NULL
          )
        `
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'stores',
        'loyalty_enabled',
        'BOOLEAN NOT NULL DEFAULT FALSE'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'stores',
        'loyalty_points_per_dollar',
        'DECIMAL(6,2) NOT NULL DEFAULT 1.00'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'stores',
        'loyalty_point_value',
        'DECIMAL(6,4) NOT NULL DEFAULT 0.01'
      )
    )
    .then(() =>
      // Off by default: real-world platforms (Toast/Square) treat combining
      // a promo code with a points redemption as merchant opt-in, not a
      // universal default - see the loyalty plan's stacking research.
      addColumnIfMissing(
        db,
        'stores',
        'loyalty_stackable_with_coupons',
        'BOOLEAN NOT NULL DEFAULT FALSE'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'points_redeemed',
        'INT NOT NULL DEFAULT 0'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'points_discount_amount',
        'DECIMAL(10,2) NOT NULL DEFAULT 0'
      )
    )
    .then(() =>
      addColumnIfMissing(db, 'orders', 'points_earned', 'INT NOT NULL DEFAULT 0')
    );
};

exports.down = function (db) {
  return dropColumnIfPresent(db, 'orders', 'points_earned')
    .then(() => dropColumnIfPresent(db, 'orders', 'points_discount_amount'))
    .then(() => dropColumnIfPresent(db, 'orders', 'points_redeemed'))
    .then(() => dropColumnIfPresent(db, 'stores', 'loyalty_stackable_with_coupons'))
    .then(() => dropColumnIfPresent(db, 'stores', 'loyalty_point_value'))
    .then(() => dropColumnIfPresent(db, 'stores', 'loyalty_points_per_dollar'))
    .then(() => dropColumnIfPresent(db, 'stores', 'loyalty_enabled'))
    .then(() => db.runSql('DROP TABLE IF EXISTS loyalty_ledger'))
    .then(() => db.runSql('DROP TABLE IF EXISTS loyalty_accounts'));
};

exports._meta = {
  version: 1,
};
