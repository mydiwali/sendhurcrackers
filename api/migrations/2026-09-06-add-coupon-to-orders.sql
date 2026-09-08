-- Run this once on any existing database (including production on Hostinger)
-- to add coupon/discount tracking to orders. Safe to re-run; MySQL 8+ ignores
-- duplicate-column errors only if you check first — if a column already
-- exists you'll get error 1060 which is safe to ignore.

ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50) DEFAULT NULL AFTER items;
ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0 AFTER coupon_code;
ALTER TABLE orders ADD COLUMN subtotal_amount DECIMAL(10,2) DEFAULT NULL AFTER discount_amount;
