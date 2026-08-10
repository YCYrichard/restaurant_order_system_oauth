'use strict';

const crypto = require('crypto');

// The customer-facing identifier for a store. `stores.id` is a sequential
// AUTO_INCREMENT int used directly in every customer-facing URL and QR code
// today - a visitor can walk /store/1, /store/2, ... and land on every
// restaurant on the platform, and a competitor can poll it to see how many
// stores exist. public_code replaces it everywhere a customer sees a URL;
// the numeric id stays the internal primary key and every FK, unchanged -
// only the public-facing surface needed a non-guessable identifier.
//
// Added nullable first, backfilled per-row, THEN made NOT NULL + UNIQUE:
// MySQL can't add a NOT NULL UNIQUE column with no default onto a table
// that already has rows. This MySQL build also rejects
// "ADD COLUMN IF NOT EXISTS", so column presence is checked via
// information_schema - same approach as every migration since
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

function indexExists(db, table, indexName) {
  return db
    .runSql(
      `
        SELECT COUNT(*) AS count
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND index_name = ?
      `,
      [table, indexName]
    )
    .then((result) => result[0].count > 0);
}

// Same primitive token.service.js already uses for refresh tokens
// (crypto.randomBytes), just shorter and URL-safe - base64url gives ~11
// characters from 8 random bytes with no padding or +/ characters to
// percent-encode in a URL or QR code.
function generateCode() {
  return crypto.randomBytes(8).toString('base64url');
}

exports.up = async function (db) {
  const hasColumn = await columnExists(db, 'stores', 'public_code');

  if (!hasColumn) {
    await db.runSql(
      'ALTER TABLE stores ADD COLUMN public_code VARCHAR(16) NULL AFTER id'
    );
  }

  const rows = await db.runSql(
    'SELECT id FROM stores WHERE public_code IS NULL'
  );

  // The UNIQUE constraint isn't added until after this backfill (a table
  // with existing rows can't gain one atomically), so a DB-level duplicate
  // error can't be relied on here - track what's been issued this run
  // instead. Collision odds at 64 bits of randomness are negligible, but
  // "negligible" isn't "impossible."
  const issued = new Set();

  for (const row of rows) {
    let code = generateCode();
    while (issued.has(code)) {
      code = generateCode();
    }
    issued.add(code);

    await db.runSql('UPDATE stores SET public_code = ? WHERE id = ?', [
      code,
      row.id,
    ]);
  }

  const hasUniqueIndex = await indexExists(
    db,
    'stores',
    'unique_stores_public_code'
  );

  if (!hasUniqueIndex) {
    await db.runSql(
      'ALTER TABLE stores MODIFY COLUMN public_code VARCHAR(16) NOT NULL'
    );
    await db.runSql(
      'ALTER TABLE stores ADD UNIQUE KEY unique_stores_public_code (public_code)'
    );
  }
};

exports.down = async function (db) {
  const hasUniqueIndex = await indexExists(
    db,
    'stores',
    'unique_stores_public_code'
  );

  if (hasUniqueIndex) {
    await db.runSql('ALTER TABLE stores DROP INDEX unique_stores_public_code');
  }

  const hasColumn = await columnExists(db, 'stores', 'public_code');

  if (hasColumn) {
    await db.runSql('ALTER TABLE stores DROP COLUMN public_code');
  }
};

exports._meta = {
  version: 1,
};
