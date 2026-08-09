'use strict';

// Adds explicit fulfillment (pickup vs delivery) to orders, and per-item
// notes to order_items. Previously checkout implicitly assumed pickup and
// the only free-text field was a single order-level `notes` column.
//
// This MySQL server doesn't support "ADD/DROP COLUMN IF [NOT] EXISTS", so
// column presence is checked via information_schema - same approach as
// 20260809120001-reconcile-schema-drift.js.

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
  return addColumnIfMissing(
    db,
    'orders',
    'fulfillment_type',
    "ENUM('pickup', 'delivery') NOT NULL DEFAULT 'pickup' AFTER status"
  )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'delivery_address',
        'VARCHAR(255) NULL AFTER fulfillment_type'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'order_items',
        'notes',
        'VARCHAR(255) NULL AFTER price'
      )
    );
};

exports.down = function (db) {
  return dropColumnIfPresent(db, 'order_items', 'notes')
    .then(() => dropColumnIfPresent(db, 'orders', 'delivery_address'))
    .then(() => dropColumnIfPresent(db, 'orders', 'fulfillment_type'));
};

exports._meta = {
  version: 1,
};
