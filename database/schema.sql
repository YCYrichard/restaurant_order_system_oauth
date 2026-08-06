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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  FOREIGN KEY (category_id) REFERENCES categories(id)
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