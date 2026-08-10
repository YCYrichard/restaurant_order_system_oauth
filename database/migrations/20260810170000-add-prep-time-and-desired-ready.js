'use strict';

// Desired pickup time: the owner sets a minimum prep time per store, and a
// customer picks a ready-by slot at or after now + that lead time (see
// stores.min_prep_minutes and reports/pickup-slots.service.js). NULL on
// orders.desired_ready_at means ASAP - not every customer wants to specify
// a time, and defaulting to NULL keeps every existing order meaningful
// without a backfill guess.
//
// This MySQL build rejects "ADD COLUMN IF NOT EXISTS", so column presence
// is checked via information_schema - same approach as every migration
// since 20260809120001-reconcile-schema-drift.js.

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
    'stores',
    'min_prep_minutes',
    'INT NOT NULL DEFAULT 15 AFTER timezone'
  ).then(() =>
    addColumnIfMissing(
      db,
      'orders',
      'desired_ready_at',
      'DATETIME NULL AFTER table_number'
    )
  );
};

exports.down = function (db) {
  return dropColumnIfPresent(db, 'orders', 'desired_ready_at').then(() =>
    dropColumnIfPresent(db, 'stores', 'min_prep_minutes')
  );
};

exports._meta = {
  version: 1,
};
