'use strict';

// The dev database had several changes applied by hand that were never
// captured in database/schema.sql or a migration: the owner_store_access
// table (required by auth.middleware.js:requireStoreAccess,
// stores.controller.js, categories.controller.js), products.description
// and products.image_url, categories.updated_at, and an 'owner' value on
// users.role. This migration brings a fresh database in line with what the
// application code already assumes, and is a no-op against databases that
// already have these changes applied by hand.
//
// This MySQL server doesn't support "ADD/DROP COLUMN IF [NOT] EXISTS", so
// column presence is checked via information_schema instead.

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
    return db.runSql(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${columnDdl}`
    );
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
    .runSql(`
      CREATE TABLE IF NOT EXISTS owner_store_access (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        store_id INT NOT NULL,
        access_role ENUM('owner', 'manager', 'staff') NOT NULL DEFAULT 'owner',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_store_access (user_id, store_id),
        CONSTRAINT fk_owner_store_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_owner_store_store FOREIGN KEY (store_id)
          REFERENCES stores(id) ON DELETE CASCADE
      )
    `)
    .then(() =>
      addColumnIfMissing(
        db,
        'products',
        'description',
        'VARCHAR(500) NULL AFTER is_active'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'products',
        'image_url',
        'VARCHAR(500) NULL AFTER description'
      )
    )
    .then(() =>
      addColumnIfMissing(
        db,
        'categories',
        'updated_at',
        'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      )
    )
    .then(() =>
      db.runSql(`
        ALTER TABLE users
          MODIFY COLUMN role ENUM('customer', 'staff', 'owner', 'admin')
            DEFAULT 'customer'
      `)
    );
};

exports.down = function (db) {
  return db
    .runSql('DROP TABLE IF EXISTS owner_store_access')
    .then(() => dropColumnIfPresent(db, 'products', 'image_url'))
    .then(() => dropColumnIfPresent(db, 'products', 'description'))
    .then(() => dropColumnIfPresent(db, 'categories', 'updated_at'))
    .then(() =>
      db.runSql(`
        ALTER TABLE users
          MODIFY COLUMN role ENUM('customer', 'staff', 'admin')
            DEFAULT 'customer'
      `)
    );
};

exports._meta = {
  version: 1,
};
