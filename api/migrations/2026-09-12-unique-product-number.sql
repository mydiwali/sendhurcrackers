-- Run this once on any existing database (including production on Hostinger)
-- to make product_number a unique column. Safe to re-run.

-- Step 1: find any duplicate product_number values first.
SELECT product_number, COUNT(*) AS c
FROM products
WHERE product_number IS NOT NULL
GROUP BY product_number
HAVING c > 1;

-- Step 2: for every id returned by Step 1 EXCEPT the oldest one in each group,
-- give it the next free number (repeat once per duplicate row found).
-- Example (id copied from Step 1's results):
-- UPDATE products
-- SET product_number = (SELECT next_num FROM (SELECT MAX(product_number) + 1 AS next_num FROM products) t)
-- WHERE id = '<duplicate-row-id>';

-- Step 3: re-run Step 1 to confirm zero rows, then enforce uniqueness going
-- forward (a UNIQUE key still allows multiple NULLs in InnoDB).
ALTER TABLE products ADD UNIQUE KEY idx_products_number (product_number);
