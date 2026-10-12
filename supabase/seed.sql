-- 0002_seed_data.sql
-- Dear Body demo catalogue.
-- ALL PRICES ARE DEMO PLACEHOLDERS. Replace with real client data when available.
-- Format: DEMO PRICE - REPLACE WITH CLIENT PRICE
-- Per rule: never invent unidentified scent names; use "Unknown / To Be Confirmed".

-- ============================================================
-- CUSTOMER TYPES
-- ============================================================
INSERT INTO customer_types (id, name, slug, is_wholesale) VALUES
    ('a1111111-1111-1111-1111-111111111111', 'Retail', 'retail', FALSE),
    ('a1111111-1111-1111-1111-111111111112', 'Wholesale', 'wholesale', TRUE);

-- ============================================================
-- ORDER STATUSES
-- ============================================================
INSERT INTO order_statuses (id, name, slug, sort_order) VALUES
    ('b1111111-1111-1111-1111-111111111101', 'Draft', 'draft', 10),
    ('b1111111-1111-1111-1111-111111111102', 'Pending Checkout', 'pending_checkout', 20),
    ('b1111111-1111-1111-1111-111111111103', 'Awaiting Payment', 'awaiting_payment', 30),
    ('b1111111-1111-1111-1111-111111111104', 'Payment Processing', 'payment_processing', 40),
    ('b1111111-1111-1111-1111-111111111105', 'Paid', 'paid', 50),
    ('b1111111-1111-1111-1111-111111111106', 'Confirmed', 'confirmed', 60),
    ('b1111111-1111-1111-1111-111111111107', 'Processing', 'processing', 70),
    ('b1111111-1111-1111-1111-111111111108', 'Ready for Dispatch', 'ready_for_dispatch', 80),
    ('b1111111-1111-1111-1111-111111111109', 'Dispatched', 'dispatched', 90),
    ('b1111111-1111-1111-1111-111111111110', 'Delivered', 'delivered', 100),
    ('b1111111-1111-1111-1111-111111111111', 'Payment Failed', 'payment_failed', 25),
    ('b1111111-1111-1111-1111-111111111112', 'Cancelled', 'cancelled', 110),
    ('b1111111-1111-1111-1111-111111111113', 'Refunded', 'refunded', 120);

-- ============================================================
-- DELIVERY METHODS
-- ============================================================
INSERT INTO delivery_methods (id, name, slug, description) VALUES
    ('c1111111-1111-1111-1111-111111111101', 'Pickup Point', 'pickup', 'Collect from a designated pickup point'),
    ('c1111111-1111-1111-1111-111111111102', 'Courier', 'courier', 'Door-to-door courier delivery'),
    ('c1111111-1111-1111-1111-111111111103', 'Bus', 'bus', 'Deliver via scheduled bus service to a station');

-- ============================================================
-- SCENTS (identifiable from product photography only)
-- ============================================================
INSERT INTO scents (id, name, slug, description) VALUES
    ('d1111111-1111-1111-1111-111111111101', 'Sweet Vanilla', 'sweet-vanilla', 'Warm vanilla gourmand'),
    ('d1111111-1111-1111-1111-111111111102', 'Enjoy Life', 'enjoy-life', 'Bright citrus fresh'),
    ('d1111111-1111-1111-1111-111111111103', 'Pink Velvet', 'pink-velvet', 'Soft floral rose'),
    ('d1111111-1111-1111-1111-111111111104', 'Mango Mandarin', 'mango-mandarin', 'Tropical fruit blend'),
    ('d1111111-1111-1111-1111-111111111105', 'Monday', 'monday', 'Unknown / To Be Confirmed'),
    ('d1111111-1111-1111-1111-111111111106', 'Tuesday', 'tuesday', 'Unknown / To Be Confirmed'),
    ('d1111111-1111-1111-1111-111111111107', 'Wednesday', 'wednesday', 'Unknown / To Be Confirmed'),
    ('d1111111-1111-1111-1111-111111111108', 'Friday', 'friday', 'Unknown / To Be Confirmed'),
    ('d1111111-1111-1111-1111-111111111109', 'Sunday', 'sunday', 'Unknown / To Be Confirmed'),
    ('d1111111-1111-1111-1111-111111111110', 'Saturday', 'saturday', 'Unknown / To Be Confirmed'),
    ('d1111111-1111-1111-1111-111111111111', 'Mango Mandarin Tutti', 'mango-mandarin-titti', 'Tropical fruit blend'),
    ('d1111111-1111-1111-1111-111111111112', 'Always Yours', 'always-yours', 'Unknown / To Be Confirmed'),
    ('d1111111-1111-1111-1111-111111111113', 'Trim & Fit', 'trim-fit', 'Unknown / To Be Confirmed');

-- ============================================================
-- PRODUCT TYPES
-- ============================================================
INSERT INTO product_types (id, name, slug, category) VALUES
    ('e1111111-1111-1111-1111-111111111101', 'Body Mist', 'body-mist', 'fragrance'),
    ('e1111111-1111-1111-1111-111111111102', 'Body Lotion', 'body-lotion', 'skincare'),
    ('e1111111-1111-1111-1111-111111111103', 'Perfume', 'perfume', 'fragrance'),
    ('e1111111-1111-1111-1111-111111111104', 'Deodorant', 'deodorant', 'fragrance'),
    ('e1111111-1111-1111-1111-111111111105', 'Body Splash', 'body-splash', 'fragrance'),
    ('e1111111-1111-1111-1111-111111111106', 'Eau de Parfum', 'eau-de-parfum', 'fragrance'),
    ('e1111111-1111-1111-1111-111111111107', 'Diet Coffee', 'diet-coffee', 'food');

-- ============================================================
-- PRODUCTS
-- ============================================================

-- Fine Fragrance Mist 236ml (4 identifiable scents)
INSERT INTO products (id, name, slug, description, is_demo, demo_price_note) VALUES
    ('f1111111-1111-1111-1111-111111111101', 'Fine Fragrance Mist', 'fine-fragrance-mist',
     'DEMO PRICE: Retail KES 850 / Wholesale KES 700 at 12+ units. REPLACE WITH CLIENT PRICE.',
     TRUE, 'DEMO PRICE - REPLACE WITH CLIENT PRICE');

-- My Dear Body - Body Mist
INSERT INTO products (id, name, slug, description, is_demo, demo_price_note) VALUES
    ('f1111111-1111-1111-1111-111111111102', 'My Dear Body Mist', 'my-dear-body-mist',
     'DEMO PRICE: Retail KES 850 / Wholesale KES 700 at 12+ units. REPLACE WITH CLIENT PRICE.',
     TRUE, 'DEMO PRICE - REPLACE WITH CLIENT PRICE');

-- My Dear Body - Body Lotion
INSERT INTO products (id, name, slug, description, is_demo, demo_price_note) VALUES
    ('f1111111-1111-1111-1111-111111111103', 'My Dear Body Lotion', 'my-dear-body-lotion',
     'DEMO PRICE: Retail KES 850 / Wholesale KES 700 at 12+ units. REPLACE WITH CLIENT PRICE.',
     TRUE, 'DEMO PRICE - REPLACE WITH CLIENT PRICE');

-- Signature Collection - Body Lotion
INSERT INTO products (id, name, slug, description, is_demo, demo_price_note) VALUES
    ('f1111111-1111-1111-1111-111111111104', 'Signature Collection Body Lotion', 'signature-collection-body-lotion',
     'DEMO PRICE: Retail KES 950 / Wholesale KES 780 at 12+ units. REPLACE WITH CLIENT PRICE.',
     TRUE, 'DEMO PRICE - REPLACE WITH CLIENT PRICE');

-- Body Splash
INSERT INTO products (id, name, slug, description, is_demo, demo_price_note) VALUES
    ('f1111111-1111-1111-1111-111111111105', 'Body Splash', 'body-splash',
     'DEMO PRICE: Retail KES 750 / Wholesale KES 620 at 12+ units. REPLACE WITH CLIENT PRICE.',
     TRUE, 'DEMO PRICE - REPLACE WITH CLIENT PRICE');

-- Eau de Parfum
INSERT INTO products (id, name, slug, description, is_demo, demo_price_note) VALUES
    ('f1111111-1111-1111-1111-111111111106', 'Eau de Parfum', 'eau-de-parfum',
     'DEMO PRICE: Retail KES 1400 / Wholesale KES 1150 at 12+ units. REPLACE WITH CLIENT PRICE.',
     TRUE, 'DEMO PRICE - REPLACE WITH CLIENT PRICE');

-- Deodorant Body Spray
INSERT INTO products (id, name, slug, description, is_demo, demo_price_note) VALUES
    ('f1111111-1111-1111-1111-111111111107', 'Deodorant Body Spray', 'deodorant-body-spray',
     'DEMO PRICE: Retail KES 550 / Wholesale KES 450 at 12+ units. REPLACE WITH CLIENT PRICE.',
     TRUE, 'DEMO PRICE - REPLACE WITH CLIENT PRICE');

-- Trim & Fit Diet Coffee - INACTIVE until verified client data is provided (§19)
INSERT INTO products (id, name, slug, description, is_demo, demo_price_note, active) VALUES
    ('f1111111-1111-1111-1111-111111111108', 'Trim & Fit Diet Coffee', 'trim-fit-diet-coffee',
     'INACTIVE - No verified product information. Do not make health or weight-loss claims.',
     TRUE, 'DEMO PRICE - REPLACE WITH CLIENT PRICE', FALSE);

-- ============================================================
-- PRODUCT VARIANTS (§4)
-- Each variant = product_type + scent + size, with its own SKU, prices, stock.
-- All prices are DEMO PLACEHOLDERS: "DEMO PRICE - REPLACE WITH CLIENT PRICE"
-- ============================================================

-- Fine Fragrance Mist 236ml - 4 identifiable scents
INSERT INTO product_variants (id, product_id, product_type_id, scent_id, size, sku, retail_price, wholesale_price, wholesale_threshold, stock_quantity, active, metadata) VALUES
    ('10000001-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111101', 'e1111111-1111-1111-1111-111111111101', 'd1111111-1111-1111-1111-111111111101', '236ml', 'FFM-SV-236', 850, 700, 12, 50, TRUE, '{}'),
    ('10000001-0000-0000-0000-000000000002', 'f1111111-1111-1111-1111-111111111101', 'e1111111-1111-1111-1111-111111111101', 'd1111111-1111-1111-1111-111111111102', '236ml', 'FFM-EL-236', 850, 700, 12, 50, TRUE, '{}'),
    ('10000001-0000-0000-0000-000000000003', 'f1111111-1111-1111-1111-111111111101', 'e1111111-1111-1111-1111-111111111101', 'd1111111-1111-1111-1111-111111111103', '236ml', 'FFM-PV-236', 850, 700, 12, 50, TRUE, '{}'),
    ('10000001-0000-0000-0000-000000000004', 'f1111111-1111-1111-1111-111111111101', 'e1111111-1111-1111-1111-111111111101', 'd1111111-1111-1111-1111-111111111104', '236ml', 'FFM-MM-236', 850, 700, 12, 50, TRUE, '{}');

-- My Dear Body - Body Mist (Monday, Tuesday, Wednesday, Friday, Sunday)
INSERT INTO product_variants (id, product_id, product_type_id, scent_id, size, sku, retail_price, wholesale_price, wholesale_threshold, stock_quantity, active, metadata) VALUES
    ('10000002-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111102', 'e1111111-1111-1111-1111-111111111101', 'd1111111-1111-1111-1111-111111111105', '236ml', 'MDB-MONDAY', 850, 700, 12, 40, TRUE, '{}'),
    ('10000002-0000-0000-0000-000000000002', 'f1111111-1111-1111-1111-111111111102', 'e1111111-1111-1111-1111-111111111101', 'd1111111-1111-1111-1111-111111111106', '236ml', 'MDB-TUESDAY', 850, 700, 12, 40, TRUE, '{}'),
    ('10000002-0000-0000-0000-000000000003', 'f1111111-1111-1111-1111-111111111102', 'e1111111-1111-1111-1111-111111111101', 'd1111111-1111-1111-1111-111111111107', '236ml', 'MDB-WEDNESDAY', 850, 700, 12, 40, TRUE, '{}'),
    ('10000002-0000-0000-0000-000000000004', 'f1111111-1111-1111-1111-111111111102', 'e1111111-1111-1111-1111-111111111101', 'd1111111-1111-1111-1111-111111111108', '236ml', 'MDB-FRIDAY', 850, 700, 12, 40, TRUE, '{}'),
    ('10000002-0000-0000-0000-000000000005', 'f1111111-1111-1111-1111-111111111102', 'e1111111-1111-1111-1111-111111111101', 'd1111111-1111-1111-1111-111111111109', '236ml', 'MDB-SUNDAY', 850, 700, 12, 40, TRUE, '{}');

-- My Dear Body - Body Lotion (Friday, Saturday, others)
INSERT INTO product_variants (id, product_id, product_type_id, scent_id, size, sku, retail_price, wholesale_price, wholesale_threshold, stock_quantity, active, metadata) VALUES
    ('10000003-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111103', 'e1111111-1111-1111-1111-111111111102', 'd1111111-1111-1111-1111-111111111108', '500ml', 'MDBL-FRIDAY', 850, 700, 12, 40, TRUE, '{}'),
    ('10000003-0000-0000-0000-000000000002', 'f1111111-1111-1111-1111-111111111103', 'e1111111-1111-1111-1111-111111111102', 'd1111111-1111-1111-1111-111111111110', '500ml', 'MDBL-SATURDAY', 850, 700, 12, 40, TRUE, '{}');

-- Signature Collection - Body Lotion (Mango Mandarin Tutti + others)
INSERT INTO product_variants (id, product_id, product_type_id, scent_id, size, sku, retail_price, wholesale_price, wholesale_threshold, stock_quantity, active, metadata) VALUES
    ('10000004-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111104', 'e1111111-1111-1111-1111-111111111102', 'd1111111-1111-1111-1111-111111111111', '500ml', 'SC-MMT-500', 950, 780, 12, 40, TRUE, '{}');

-- Body Splash 236ml
INSERT INTO product_variants (id, product_id, product_type_id, scent_id, size, sku, retail_price, wholesale_price, wholesale_threshold, stock_quantity, active, metadata) VALUES
    ('10000005-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111105', 'e1111111-1111-1111-1111-111111111105', 'd1111111-1111-1111-1111-111111111101', '236ml', 'BS-SV-236', 750, 620, 12, 40, TRUE, '{}');

-- Eau de Parfum 90ml (Always Yours + others)
INSERT INTO product_variants (id, product_id, product_type_id, scent_id, size, sku, retail_price, wholesale_price, wholesale_threshold, stock_quantity, active, metadata) VALUES
    ('10000006-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111106', 'e1111111-1111-1111-1111-111111111106', 'd1111111-1111-1111-1111-111111111112', '90ml', 'EDP-AY-90', 1400, 1150, 12, 30, TRUE, '{}');

-- Deodorant Body Spray 250ml
INSERT INTO product_variants (id, product_id, product_type_id, scent_id, size, sku, retail_price, wholesale_price, wholesale_threshold, stock_quantity, active, metadata) VALUES
    ('10000007-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111107', 'e1111111-1111-1111-1111-111111111104', 'd1111111-1111-1111-1111-111111111101', '250ml', 'DBS-SV-250', 550, 450, 12, 30, TRUE, '{}');

-- Trim & Fit Diet Coffee - INACTIVE (§19: no health claims, excluded from main catalogue)
INSERT INTO product_variants (id, product_id, product_type_id, scent_id, size, sku, retail_price, wholesale_price, wholesale_threshold, stock_quantity, active, metadata) VALUES
    ('10000008-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111108', 'e1111111-1111-1111-1111-111111111107', 'd1111111-1111-1111-1111-111111111113', '100g', 'TFD-COFFEE-100', 980, 800, 10, 0, FALSE, '{"warning": "INACTIVE - no verified product info; no health/weight-loss claims permitted"}');


-- ============================================================
-- INVENTORY (initialise from variant stock)
-- ============================================================

INSERT INTO inventory (variant_id, quantity_on_hand, reserved_quantity, version)
SELECT id, stock_quantity, 0, 1 FROM product_variants;

-- ============================================================
-- COUNTIES (major Kenyan counties)
-- ============================================================

INSERT INTO counties (id, name, slug, region) VALUES
    ('11000000-0000-0000-0000-000000000001', 'Nairobi', 'nairobi', 'Central'),
    ('11000000-0000-0000-0000-000000000002', 'Kiambu', 'kiambu', 'Central'),
    ('11000000-0000-0000-0000-000000000003', 'Machakos', 'machakos', 'Eastern'),
    ('11000000-0000-0000-0000-000000000004', 'Mombasa', 'mombasa', 'Coast'),
    ('11000000-0000-0000-0000-000000000005', 'Kisumu', 'kisumu', 'Nyanza'),
    ('11000000-0000-0000-0000-000000000006', 'Nakuru', 'nakuru', 'Rift Valley'),
    ('11000000-0000-0000-0000-000000000007', 'Eldoret', 'eldoret', 'Rift Valley'),
    ('11000000-0000-0000-0000-000000000008', 'Thika', 'thika', 'Central'),
    ('11000000-0000-0000-0000-000000000009', 'Kakamega', 'kakamega', 'Western'),
    ('11000000-0000-0000-0000-000000000010', 'Meru', 'meru', 'Eastern');

-- ============================================================
-- PICKUP POINTS
-- ============================================================

INSERT INTO pickup_points (id, name, slug, county_id, delivery_method_id, address, landmark) VALUES
    ('21000000-0000-0000-0000-000000000001', 'Thika CBD', 'thika-cbd', '11000000-0000-0000-0000-000000000008', '11000000-0000-0000-0000-000000000001', 'Thika Town', 'Next to Thika Supermarket'),
    ('21000000-0000-0000-0000-000000000002', 'Nairobi CBD', 'nairobi-cbd', '11000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Nairobi City Centre', 'Opposite City Hall');

-- ============================================================
-- DELIVERY RATES
-- ============================================================

INSERT INTO delivery_rates (county_id, delivery_method_id, pickup_point_id, fee, estimated_delivery_time, minimum_order_total, active) VALUES
    ('11000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 200, '1-2 business days', 500, TRUE),
    ('11000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', NULL, 400, '2-3 business days', 1000, TRUE),
    ('11000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', NULL, 350, '1-2 business days', 1000, TRUE),
    ('11000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000002', NULL, 600, '3-5 business days', 2000, TRUE),
    ('11000000-0000-0000-0000-000000000005', '11000000-0000-0000-0000-000000000002', NULL, 550, '3-5 business days', 2000, TRUE),
    ('11000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000003', NULL, 300, '2-4 business days', 1500, TRUE);

-- ============================================================
-- BUSINESS SETTINGS
-- ============================================================

INSERT INTO business_settings (key, value, description) VALUES
    ('wholesale_default_threshold', '{"value":12}', 'Default wholesale minimum quantity'),
    ('order_expiry_hours', '{"value":24}', 'Order expiry after creation'),
    ('low_stock_threshold', '{"value":5}', 'Default low-stock threshold'),
    ('demo_price_note', '{"text":"DEMO PRICE - REPLACE WITH CLIENT PRICE"}', 'Demo pricing disclosure'),
    ('trim_fit_status', '{"status":"inactive","reason":"No verified product information; health claims not permitted until client provides verified data."}', 'Trim & Fit Diet Coffee status');
