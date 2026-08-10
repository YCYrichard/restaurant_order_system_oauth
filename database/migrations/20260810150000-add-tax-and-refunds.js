'use strict';

// Tax breakdown on orders, plus refund records.
//
// Taiwan business tax is normally INCLUSIVE (內含): the displayed price
// already contains the 5% and a receipt breaks the component out, rather
// than adding tax on top at checkout. That's the default here. Stores in
// tax-exclusive markets flip tax_inclusive to false and the tax is added
// instead. Getting this backwards would overcharge every customer by the
// tax rate, which is why it's an explicit per-store flag rather than an
// assumption.
//
// orders.total keeps its existing meaning throughout: what the customer
// pays. subtotal and tax_amount are the breakdown of that figure, and
// tax_rate is snapshotted so a later rate change can't rewrite history.

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
    'tax_rate',
    'DECIMAL(5,4) NOT NULL DEFAULT 0.0000 AFTER timezone'
  )
    .then(() =>
      addColumnIfMissing(
        db,
        'stores',
        'tax_inclusive',
        'BOOLEAN NOT NULL DEFAULT TRUE AFTER tax_rate'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'subtotal',
        'DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'tax_amount',
        'DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER subtotal'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'tax_rate',
        'DECIMAL(5,4) NOT NULL DEFAULT 0.0000 AFTER tax_amount'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'orders',
        'tax_inclusive',
        'BOOLEAN NOT NULL DEFAULT TRUE AFTER tax_rate'
      )
    )
    .then(() =>
      db.runSql(`
        CREATE TABLE IF NOT EXISTS order_refunds (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          reason VARCHAR(255) NULL,
          created_by INT NULL,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_order_refunds_order (order_id),
          CONSTRAINT fk_order_refunds_order FOREIGN KEY (order_id)
            REFERENCES orders(id) ON DELETE CASCADE,
          CONSTRAINT fk_order_refunds_user FOREIGN KEY (created_by)
            REFERENCES users(id) ON DELETE SET NULL
        )
      `)
    )
    .then(() =>
      // Existing orders predate the breakdown. Backfill subtotal from the
      // total they were actually charged, leaving tax at zero - inventing a
      // tax split for historical orders would be fabricating records.
      db.runSql('UPDATE orders SET subtotal = total WHERE subtotal = 0')
    );
};

exports.down = function (db) {
  return db
    .runSql('DROP TABLE IF EXISTS order_refunds')
    .then(() => dropColumnIfPresent(db, 'orders', 'tax_inclusive'))
    .then(() => dropColumnIfPresent(db, 'orders', 'tax_rate'))
    .then(() => dropColumnIfPresent(db, 'orders', 'tax_amount'))
    .then(() => dropColumnIfPresent(db, 'orders', 'subtotal'))
    .then(() => dropColumnIfPresent(db, 'stores', 'tax_inclusive'))
    .then(() => dropColumnIfPresent(db, 'stores', 'tax_rate'));
};

exports._meta = {
  version: 1,
};
