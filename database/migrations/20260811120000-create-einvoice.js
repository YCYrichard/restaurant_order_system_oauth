'use strict';

// Taiwan electronic invoice (電子發票) tracking. Small-scale businesses
// averaging under NT$200,000 in monthly sales are legally exempt from
// issuing Uniform Invoices at all (小規模營業人) - so this is a per-store
// opt-in on the owner's own settings, same shape as loyalty_enabled, not a
// default-on requirement.
//
// This tracks the REQUIREMENT and, once issued, the real invoice number -
// it does not itself transmit anything to the Ministry of Finance or a
// certified value-added center (ECPay/綠界 etc.), since that needs real
// merchant credentials this system doesn't have. einvoice_status stays
// 'pending' until someone records the actual invoice number obtained
// through the store's own MOF-registered system, mirroring how a cash
// payment is recorded after the fact rather than charged through a gateway.

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
    'einvoice_enabled',
    'BOOLEAN NOT NULL DEFAULT FALSE'
  )
    .then(() =>
      addColumnIfMissing(db, 'stores', 'einvoice_tax_id', 'VARCHAR(8) NULL')
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'einvoice_status',
        `ENUM('not_applicable', 'pending', 'issued', 'void') NOT NULL DEFAULT 'not_applicable'`
      )
    )
    .then(() =>
      addColumnIfMissing(db, 'orders', 'einvoice_number', 'VARCHAR(10) NULL')
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'einvoice_buyer_tax_id',
        'VARCHAR(8) NULL'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'einvoice_donate',
        'BOOLEAN NOT NULL DEFAULT FALSE'
      )
    )
    .then(() =>
      addColumnIfMissing(db, 'orders', 'einvoice_issued_at', 'TIMESTAMP NULL')
    );
};

exports.down = function (db) {
  return dropColumnIfPresent(db, 'orders', 'einvoice_issued_at')
    .then(() => dropColumnIfPresent(db, 'orders', 'einvoice_donate'))
    .then(() => dropColumnIfPresent(db, 'orders', 'einvoice_buyer_tax_id'))
    .then(() => dropColumnIfPresent(db, 'orders', 'einvoice_number'))
    .then(() => dropColumnIfPresent(db, 'orders', 'einvoice_status'))
    .then(() => dropColumnIfPresent(db, 'stores', 'einvoice_tax_id'))
    .then(() => dropColumnIfPresent(db, 'stores', 'einvoice_enabled'));
};

exports._meta = {
  version: 1,
};
