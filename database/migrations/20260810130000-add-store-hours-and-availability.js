'use strict';

// Store opening hours (with holiday overrides) and fast item 86ing.
//
// A store with NO store_hours rows is treated as always open, so existing
// stores keep working exactly as before and hours are opt-in. Without that,
// this migration would silently close every store in the database.
//
// This MySQL build rejects "ADD COLUMN IF NOT EXISTS", so column presence is
// checked via information_schema - same approach as
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
    'stores',
    'timezone',
    "VARCHAR(64) NOT NULL DEFAULT 'Asia/Taipei' AFTER phone"
  )
    .then(() =>
      db.runSql(`
        CREATE TABLE IF NOT EXISTS store_hours (
          id INT AUTO_INCREMENT PRIMARY KEY,
          store_id INT NOT NULL,
          day_of_week TINYINT NOT NULL,
          open_time TIME NOT NULL,
          close_time TIME NOT NULL,
          is_closed BOOLEAN NOT NULL DEFAULT FALSE,
          UNIQUE KEY unique_store_day (store_id, day_of_week),
          CONSTRAINT fk_store_hours_store FOREIGN KEY (store_id)
            REFERENCES stores(id) ON DELETE CASCADE
        )
      `)
    )
    .then(() =>
      db.runSql(`
        CREATE TABLE IF NOT EXISTS store_closures (
          id INT AUTO_INCREMENT PRIMARY KEY,
          store_id INT NOT NULL,
          closure_date DATE NOT NULL,
          reason VARCHAR(255) NULL,
          UNIQUE KEY unique_store_closure (store_id, closure_date),
          CONSTRAINT fk_store_closures_store FOREIGN KEY (store_id)
            REFERENCES stores(id) ON DELETE CASCADE
        )
      `)
    )
    .then(() =>
      // "86" in kitchen usage: temporarily out. Distinct from is_active,
      // which is a deliberate long-term delisting - this expires on its own
      // so nobody has to remember to switch the item back on tomorrow.
      addColumnIfMissing(
        db,
        'products',
        'unavailable_until',
        'DATETIME NULL AFTER is_active'
      )
    );
};

exports.down = function (db) {
  return dropColumnIfPresent(db, 'products', 'unavailable_until')
    .then(() => db.runSql('DROP TABLE IF EXISTS store_closures'))
    .then(() => db.runSql('DROP TABLE IF EXISTS store_hours'))
    .then(() => dropColumnIfPresent(db, 'stores', 'timezone'));
};

exports._meta = {
  version: 1,
};
