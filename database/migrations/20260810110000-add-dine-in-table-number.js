'use strict';

// Adds dine-in as a third fulfillment type, plus the table an order was
// placed from. Tables deliberately have no entity of their own - a table
// is just a number encoded in a QR code, so there's nothing to manage
// beyond what's already on the order. If per-table metadata (seats, zone,
// enable/disable) is ever needed, that's when a store_tables table earns
// its place.

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
        ALTER TABLE orders
          MODIFY COLUMN fulfillment_type
            ENUM('pickup', 'delivery', 'dine_in') NOT NULL DEFAULT 'pickup'
      `
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'table_number',
        'INT NULL AFTER delivery_address'
      )
    );
};

exports.down = function (db) {
  return dropColumnIfPresent(db, 'orders', 'table_number').then(() =>
    // Any existing dine_in rows would block this narrowing - move them to
    // pickup first so the rollback can't half-apply.
    db
      .runSql(
        "UPDATE orders SET fulfillment_type = 'pickup' WHERE fulfillment_type = 'dine_in'"
      )
      .then(() =>
        db.runSql(
          `
            ALTER TABLE orders
              MODIFY COLUMN fulfillment_type
                ENUM('pickup', 'delivery') NOT NULL DEFAULT 'pickup'
          `
        )
      )
  );
};

exports._meta = {
  version: 1,
};
