'use strict';

// Structured menu options: size, add-ons, doneness, and so on. Until now
// the only customisation was a free-text note a cook had to interpret and
// which earned nothing.
//
// Groups belong to a store and attach to products many-to-many, so "Size"
// or "Add-ons" is defined once and reused across the menu.
//
// order_item_modifiers snapshots the option's name and price alongside its
// id, matching how orders.coupon_code/discount_amount already work: editing
// or deleting a modifier later must not rewrite what a customer was charged.

exports.up = function (db) {
  return db
    .runSql(
      `
        CREATE TABLE IF NOT EXISTS modifier_groups (
          id INT AUTO_INCREMENT PRIMARY KEY,
          store_id INT NOT NULL,
          name VARCHAR(100) NOT NULL,
          min_select INT NOT NULL DEFAULT 0,
          max_select INT NOT NULL DEFAULT 1,
          is_required BOOLEAN NOT NULL DEFAULT FALSE,
          sort_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_modifier_groups_store (store_id),
          CONSTRAINT fk_modifier_groups_store FOREIGN KEY (store_id)
            REFERENCES stores(id) ON DELETE CASCADE
        )
      `
    )
    .then(() =>
      db.runSql(`
        CREATE TABLE IF NOT EXISTS modifier_options (
          id INT AUTO_INCREMENT PRIMARY KEY,
          group_id INT NOT NULL,
          name VARCHAR(100) NOT NULL,
          price_delta DECIMAL(10,2) NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          sort_order INT NOT NULL DEFAULT 0,
          KEY idx_modifier_options_group (group_id),
          CONSTRAINT fk_modifier_options_group FOREIGN KEY (group_id)
            REFERENCES modifier_groups(id) ON DELETE CASCADE
        )
      `)
    )
    .then(() =>
      db.runSql(`
        CREATE TABLE IF NOT EXISTS product_modifier_groups (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_id INT NOT NULL,
          group_id INT NOT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          UNIQUE KEY unique_product_group (product_id, group_id),
          CONSTRAINT fk_pmg_product FOREIGN KEY (product_id)
            REFERENCES products(id) ON DELETE CASCADE,
          CONSTRAINT fk_pmg_group FOREIGN KEY (group_id)
            REFERENCES modifier_groups(id) ON DELETE CASCADE
        )
      `)
    )
    .then(() =>
      db.runSql(`
        CREATE TABLE IF NOT EXISTS order_item_modifiers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_item_id INT NOT NULL,
          modifier_option_id INT NULL,
          group_name VARCHAR(100) NOT NULL,
          option_name VARCHAR(100) NOT NULL,
          price_delta DECIMAL(10,2) NOT NULL DEFAULT 0,
          KEY idx_oim_order_item (order_item_id),
          CONSTRAINT fk_oim_order_item FOREIGN KEY (order_item_id)
            REFERENCES order_items(id) ON DELETE CASCADE,
          CONSTRAINT fk_oim_option FOREIGN KEY (modifier_option_id)
            REFERENCES modifier_options(id) ON DELETE SET NULL
        )
      `)
    );
};

exports.down = function (db) {
  return db
    .runSql('DROP TABLE IF EXISTS order_item_modifiers')
    .then(() => db.runSql('DROP TABLE IF EXISTS product_modifier_groups'))
    .then(() => db.runSql('DROP TABLE IF EXISTS modifier_options'))
    .then(() => db.runSql('DROP TABLE IF EXISTS modifier_groups'));
};

exports._meta = {
  version: 1,
};
