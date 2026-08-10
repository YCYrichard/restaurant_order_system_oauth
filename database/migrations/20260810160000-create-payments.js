'use strict';

// Payment attempts against orders.
//
// Every attempt is recorded, not just the successful one: a failed card is
// part of the order's history and is exactly what you need when a customer
// says "it charged me twice". raw_response keeps the gateway's own reply for
// reconciliation, since a provider's transaction id is the only shared
// reference when disputing a charge.
//
// orders.payment_status is a denormalised convenience so listing orders
// doesn't need a join per row; payments remains the record of truth.

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
        CREATE TABLE IF NOT EXISTS payments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL,
          provider VARCHAR(30) NOT NULL,
          provider_transaction_id VARCHAR(128) NULL,
          amount DECIMAL(10,2) NOT NULL,
          currency CHAR(3) NOT NULL DEFAULT 'TWD',
          status ENUM('pending','paid','failed','refunded') NOT NULL
            DEFAULT 'pending',
          method VARCHAR(40) NULL,
          raw_response JSON NULL,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_payments_order (order_id),
          KEY idx_payments_provider_txn (provider_transaction_id),
          CONSTRAINT fk_payments_order FOREIGN KEY (order_id)
            REFERENCES orders(id) ON DELETE CASCADE
        )
      `
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'payment_status',
        `ENUM('unpaid','paid','refunded','failed') NOT NULL DEFAULT 'unpaid'
         AFTER total`
      )
    )
    .then(() =>
      // A refund put through the gateway gets its own transaction id back.
      // Storing it is what lets a store match its own refund record against
      // the provider's statement; without it the two are only linkable by
      // amount and timestamp, which is guesswork once there are two refunds.
      addColumnIfMissing(
        db,
        'order_refunds',
        'provider_transaction_id',
        'VARCHAR(128) NULL AFTER reason'
      )
    );
};

exports.down = function (db) {
  return dropColumnIfPresent(db, 'order_refunds', 'provider_transaction_id')
    .then(() => dropColumnIfPresent(db, 'orders', 'payment_status'))
    .then(() => db.runSql('DROP TABLE IF EXISTS payments'));
};

exports._meta = {
  version: 1,
};
