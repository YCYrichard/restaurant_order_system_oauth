'use strict';

// Baseline migration: captures the schema as originally shipped in
// database/schema.sql and database/schema_orders.sql. Uses
// CREATE TABLE IF NOT EXISTS / INSERT IGNORE so it is safe to run against
// databases that were already provisioned by hand-running those SQL files
// before migrations existed.

exports.up = function (db) {
  return db
    .runSql(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NULL,
        provider VARCHAR(30) NOT NULL,
        provider_id VARCHAR(255) NOT NULL,
        avatar_url VARCHAR(255) NULL,
        role ENUM('customer', 'staff', 'admin') DEFAULT 'customer',
        password_hash VARCHAR(255) NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_provider_user (provider, provider_id)
      )
    `)
    .then(() =>
      db.runSql(`
        CREATE TABLE IF NOT EXISTS stores (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(150) NOT NULL,
          address VARCHAR(255) NULL,
          phone VARCHAR(50) NULL,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
            ON UPDATE CURRENT_TIMESTAMP
        )
      `)
    )
    .then(() =>
      db.runSql(`
        CREATE TABLE IF NOT EXISTS categories (
          id INT AUTO_INCREMENT PRIMARY KEY,
          store_id INT NULL,
          name VARCHAR(100) NOT NULL,
          sort_order INT DEFAULT 0,
          FOREIGN KEY (store_id) REFERENCES stores(id)
        )
      `)
    )
    .then(() =>
      db.runSql(`
        CREATE TABLE IF NOT EXISTS products (
          id INT AUTO_INCREMENT PRIMARY KEY,
          store_id INT NULL,
          category_id INT NULL,
          name VARCHAR(150) NOT NULL,
          price DECIMAL(10,2) NOT NULL DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (store_id) REFERENCES stores(id),
          FOREIGN KEY (category_id) REFERENCES categories(id)
        )
      `)
    )
    .then(() =>
      db.runSql(`
        INSERT IGNORE INTO users (
          name, email, provider, provider_id, avatar_url, role, password_hash
        )
        VALUES (
          'supermao', 'supermao@example.com', 'local', 'supermao', NULL,
          'admin', '$2b$10$9.QwCNCVzE/Za55pqr5ItuHTP.G6p/B3BiKLJBC/i2wpPXSRXzQR6'
        )
      `)
    )
    .then(() =>
      db.runSql(`
        CREATE TABLE IF NOT EXISTS orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          store_id INT NOT NULL,
          status ENUM('pending','confirmed','preparing','ready','completed','cancelled')
            DEFAULT 'pending',
          total DECIMAL(10,2) NOT NULL DEFAULT 0,
          customer_name VARCHAR(150) NOT NULL,
          customer_phone VARCHAR(50) NOT NULL,
          customer_email VARCHAR(150) NULL,
          notes TEXT NULL,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
        )
      `)
    )
    .then(() =>
      db.runSql(`
        CREATE TABLE IF NOT EXISTS order_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL,
          product_id INT NOT NULL,
          quantity INT NOT NULL DEFAULT 1,
          price DECIMAL(10,2) NOT NULL,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
      `)
    );
};

exports.down = function (db) {
  return db
    .runSql('DROP TABLE IF EXISTS order_items')
    .then(() => db.runSql('DROP TABLE IF EXISTS orders'))
    .then(() => db.runSql('DROP TABLE IF EXISTS products'))
    .then(() => db.runSql('DROP TABLE IF EXISTS categories'))
    .then(() => db.runSql('DROP TABLE IF EXISTS stores'))
    .then(() => db.runSql('DROP TABLE IF EXISTS users'));
};

exports._meta = {
  version: 1,
};
