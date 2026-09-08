-- ============================================================
-- MySQL Schema for MyDiwaliCrackers E-commerce
-- Requires MySQL 8.0+
-- ============================================================
-- Setup:
--   CREATE DATABASE diwali_crackers CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   USE diwali_crackers;
--   SOURCE mysql-schema.sql;
-- ============================================================

-- Users (replaces Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  name_in_tamil VARCHAR(255),
  role VARCHAR(50) DEFAULT 'customer',
  status VARCHAR(50) DEFAULT 'active',
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin users (sub-admins)
CREATE TABLE IF NOT EXISTS admin_users (
  id CHAR(36) NOT NULL,
  uid CHAR(36),
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  display_password VARCHAR(255),
  role VARCHAR(50) DEFAULT 'subadmin',
  created_by CHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_admin_users_username (username),
  FOREIGN KEY (uid) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255),
  description TEXT,
  image_url TEXT,
  parent_id CHAR(36),
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Products
CREATE TABLE IF NOT EXISTS products (
  id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_in_tamil VARCHAR(255),
  slug VARCHAR(255),
  description TEXT,
  price DECIMAL(10,2),
  original_price DECIMAL(10,2),
  purchased_price DECIMAL(10,2),
  sku VARCHAR(255),
  stock INT DEFAULT 0,
  low_stock_threshold INT DEFAULT 5,
  category_id CHAR(36),
  active TINYINT(1) DEFAULT 1,
  is_featured TINYINT(1) DEFAULT 0,
  avg_rating DECIMAL(3,2),
  primary_image_url TEXT,
  product_number INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_products_slug (slug),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product images
CREATE TABLE IF NOT EXISTS product_images (
  id CHAR(36) NOT NULL,
  product_id CHAR(36),
  url TEXT,
  thumbnail_url TEXT,
  is_primary TINYINT(1) DEFAULT 0,
  sort_order INT DEFAULT 0,
  storage_path TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) NOT NULL,
  order_number VARCHAR(50),
  user_id CHAR(36),
  email VARCHAR(255),
  phone VARCHAR(50),
  guest_email VARCHAR(255),
  guest_phone VARCHAR(50),
  guest_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  payment_method VARCHAR(50) DEFAULT 'COD',
  total DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  shipping_address JSON,
  items JSON,
  coupon_code VARCHAR(50) DEFAULT NULL,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  subtotal_amount DECIMAL(10,2) DEFAULT NULL,
  has_lr_copy TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_orders_order_number (order_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Order tracking
CREATE TABLE IF NOT EXISTS order_tracking (
  id CHAR(36) NOT NULL,
  order_id CHAR(36),
  status VARCHAR(100),
  message TEXT,
  location VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Order attachments (LR copies, etc.)
CREATE TABLE IF NOT EXISTS order_attachments (
  id CHAR(36) NOT NULL,
  order_id CHAR(36),
  type VARCHAR(50) DEFAULT 'lr-copy',
  url TEXT,
  file_type VARCHAR(100),
  storage_path TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_order_attachments_order_type (order_id, type),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Coupons
CREATE TABLE IF NOT EXISTS coupons (
  id CHAR(36) NOT NULL,
  code VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  max_discount_amount DECIMAL(10,2),
  min_order_value DECIMAL(10,2),
  max_uses INT,
  max_uses_per_customer INT,
  valid_from DATETIME,
  valid_until DATETIME,
  is_active TINYINT(1) DEFAULT 1,
  used_count INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_coupons_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id CHAR(36) NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  user_id CHAR(36),
  user_name VARCHAR(255),
  guest_name VARCHAR(255),
  guest_email VARCHAR(255),
  customer_id VARCHAR(255),
  rating INT NOT NULL,
  title TEXT,
  comment TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  is_verified TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Settings (key-value store for banners, page config, store info)
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(255) NOT NULL,
  value JSON,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Counters (for sequential order numbers)
CREATE TABLE IF NOT EXISTS counters (
  `key` VARCHAR(255) NOT NULL,
  last_id INT DEFAULT 100,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User addresses
CREATE TABLE IF NOT EXISTS user_addresses (
  id CHAR(36) NOT NULL,
  user_id CHAR(36),
  data JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(100),
  reference_number VARCHAR(255),
  notes TEXT,
  recorded_by CHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_payments_order (order_id),
  KEY idx_payments_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initialize counters
INSERT IGNORE INTO counters (`key`, last_id) VALUES ('orders', 100);

-- ============================================================
-- Migration: add purchased_price (cost price) to existing databases
-- Run this once on your live/Hostinger MySQL database if the
-- products table was created before this column was added.
-- Never exposed on customer-facing endpoints — admin only.
-- ============================================================
-- ALTER TABLE products ADD COLUMN purchased_price DECIMAL(10,2) AFTER original_price;
