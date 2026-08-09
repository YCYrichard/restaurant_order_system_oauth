-- SUPERSEDED: kept only as a historical record of the schema as originally
-- shipped. The live schema has since drifted from this file (e.g.
-- owner_store_access, products.description/image_url, categories.updated_at,
-- and users.role's 'owner' value were added by hand and were never reflected
-- here). Do not run this file directly and do not edit it for new changes -
-- database/migrations/ is now the source of truth; see docs/setup.md.

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NULL,
  provider VARCHAR(30) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(255) NULL,
  role ENUM('customer', 'staff', 'admin') DEFAULT 'customer',
  password_hash VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_provider_user (provider, provider_id)
);

CREATE TABLE stores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255),
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT,
  category_id INT,
  name VARCHAR(150) NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ON UPDATE CURRENT_TIMESTAMP
);

-- Seed default superuser admin account
INSERT INTO users (
  name,
  email,
  provider,
  provider_id,
  avatar_url,
  role,
  password_hash
)
VALUES (
  'supermao',
  'supermao@example.com',
  'local',
  'supermao',
  NULL,
  'admin',
  '$2b$10$9.QwCNCVzE/Za55pqr5ItuHTP.G6p/B3BiKLJBC/i2wpPXSRXzQR6'
);