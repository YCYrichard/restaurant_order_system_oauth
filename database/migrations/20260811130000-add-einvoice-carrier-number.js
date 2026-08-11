'use strict';

// Personal invoices can be stored electronically to the buyer's own mobile
// barcode carrier (手機條碼) instead of printed - see einvoice.service.js for
// the format rule (a leading '/' plus 7 alphanumeric/symbol characters, per
// the Ministry of Finance's own e-invoice platform documentation).

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
    'einvoice_carrier_number',
    'VARCHAR(8) NULL'
  );
};

exports.down = function (db) {
  return dropColumnIfPresent(db, 'orders', 'einvoice_carrier_number');
};

exports._meta = {
  version: 1,
};
