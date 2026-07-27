-- ============================================================
-- Drop unused e-commerce boilerplate.
--
-- product_categories, product_items, product_variants, product_skus,
-- product_custom_fields, product_custom_values, order_headers, and
-- order_items were leftover schema unrelated to this rental platform --
-- zero references anywhere in src/, and all had wide-open
-- USING (true) / WITH CHECK (true) RLS policies (any authenticated or
-- anon caller could read/insert/update any row). Confirmed empty (0
-- rows in every table) before dropping. CASCADE cleans up the FK
-- relationships between them (order_items -> order_headers,
-- product_variants/product_skus/product_custom_values -> product_items,
-- product_custom_values -> product_custom_fields,
-- product_items -> product_categories) and their owned sequences.
-- ============================================================

DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS order_headers CASCADE;
DROP TABLE IF EXISTS product_custom_values CASCADE;
DROP TABLE IF EXISTS product_variants CASCADE;
DROP TABLE IF EXISTS product_skus CASCADE;
DROP TABLE IF EXISTS product_custom_fields CASCADE;
DROP TABLE IF EXISTS product_items CASCADE;
DROP TABLE IF EXISTS product_categories CASCADE;

NOTIFY pgrst, 'reload schema';
