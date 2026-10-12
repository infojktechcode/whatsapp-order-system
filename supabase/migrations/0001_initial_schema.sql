- 0001_initial_schema.sql
-- WhatsApp Order System - initial database schema
-- UUID primary keys, normalized tables, foreign keys, CHECK constraints, indexes.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- REFERENCE DATA
-- ============================================================

CREATE TABLE scents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    category TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE counties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    region TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE delivery_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    is_wholesale BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_statuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PRODUCTS
-- ============================================================

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    is_demo BOOLEAN NOT NULL DEFAULT TRUE,
    demo_price_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_type_id UUID NOT NULL REFERENCES product_types(id),
    scent_id UUID NOT NULL REFERENCES scents(id),
    size TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT,
    retail_price INTEGER NOT NULL CHECK (retail_price >= 0),
    wholesale_price INTEGER NOT NULL CHECK (wholesale_price >= 0),
    wholesale_threshold INTEGER NOT NULL DEFAULT 12 CHECK (wholesale_threshold >= 1),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, product_type_id, scent_id, size)
);

CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_active ON product_variants(active);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);

CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    alt_text TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_images_product_id ON product_images(product_id);
CREATE INDEX idx_product_images_variant_id ON product_images(variant_id);

-- ============================================================
-- PRICING TIERS (configurable, future-proof)
-- ============================================================

CREATE TABLE pricing_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    customer_type_id UUID NOT NULL REFERENCES customer_types(id),
    minimum_quantity INTEGER NOT NULL CHECK (minimum_quantity >= 1),
    maximum_quantity INTEGER CHECK (maximum_quantity IS NULL OR maximum_quantity >= minimum_quantity),
    price INTEGER NOT NULL CHECK (price >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (variant_id, customer_type_id, minimum_quantity)
);

CREATE INDEX idx_pricing_tiers_variant_id ON pricing_tiers(variant_id);

-- ============================================================
-- INVENTORY
-- ============================================================

CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (variant_id)
);

CREATE INDEX idx_inventory_variant_id ON inventory(variant_id);

-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    customer_type_id UUID REFERENCES customer_types(id),
    is_wholesale BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (auth_user_id)
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_auth_user_id ON customers(auth_user_id);

CREATE TABLE customer_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label TEXT,
    address_line_1 TEXT NOT NULL,
    address_line_2 TEXT,
    city TEXT,
    county_id UUID NOT NULL REFERENCES counties(id),
    postal_code TEXT,
    landmark TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_addresses_customer_id ON customer_addresses(customer_id);

-- ============================================================
-- DELIVERY
-- ============================================================

CREATE TABLE pickup_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    county_id UUID NOT NULL REFERENCES counties(id),
    delivery_method_id UUID NOT NULL REFERENCES delivery_methods(id),
    address TEXT,
    landmark TEXT,
    contact_phone TEXT,
    operating_hours TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pickup_points_county_id ON pickup_points(county_id);

CREATE TABLE delivery_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    county_id UUID NOT NULL REFERENCES counties(id),
    delivery_method_id UUID NOT NULL REFERENCES delivery_methods(id),
    pickup_point_id UUID REFERENCES pickup_points(id),
    fee INTEGER NOT NULL CHECK (fee >= 0),
    estimated_delivery_time TEXT,
    minimum_order_total INTEGER NOT NULL DEFAULT 0 CHECK (minimum_order_total >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (county_id, delivery_method_id, pickup_point_id)
);

CREATE INDEX idx_delivery_rates_county_id ON delivery_rates(county_id);
CREATE INDEX idx_delivery_rates_delivery_method_id ON delivery_rates(delivery_method_id);

-- ============================================================
-- BUSINESS SETTINGS
-- ============================================================

CREATE TABLE business_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID
);

CREATE TABLE wholesale_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_type_id UUID NOT NULL REFERENCES customer_types(id) UNIQUE,
    minimum_quantity INTEGER NOT NULL DEFAULT 12 CHECK (minimum_quantity >= 1),
    discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
    discount_value INTEGER NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ORDERS
-- ============================================================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES customers(id),
    status_id UUID NOT NULL REFERENCES order_statuses(id),
    channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp', 'phone', 'agent')),
    delivery_type TEXT NOT NULL CHECK (delivery_type IN ('pickup', 'courier', 'bus')),
    delivery_county_id UUID REFERENCES counties(id),
    delivery_method_id UUID REFERENCES delivery_methods(id),
    pickup_point_id UUID REFERENCES pickup_points(id),
    delivery_address JSONB,
    delivery_fee INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    subtotal INTEGER NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
    total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
    customer_notes TEXT,
    internal_notes TEXT,
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status_id ON orders(status_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_order_number ON orders(order_number);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    pricing_tier TEXT,
    line_total INTEGER NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_variant_id ON order_items(variant_id);

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requested', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'KES',
    method TEXT NOT NULL DEFAULT 'mpesa',
    merchant_request_id TEXT,
    checkout_request_id TEXT,
    mpesa_receipt_number TEXT,
    transaction_date TEXT,
    phone_number TEXT,
    result_code TEXT,
    result_description TEXT,
    requested_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id)
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_checkout_request_id ON payments(checkout_request_id);
CREATE INDEX idx_payments_mpesa_receipt_number ON payments(mpesa_receipt_number);
CREATE INDEX idx_payments_status ON payments(status);

CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id),
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('stk_push', 'callback', 'reversal', 'refund', 'query')),
    checkout_request_id TEXT,
    merchant_request_id TEXT,
    mpesa_receipt_number TEXT,
    amount INTEGER,
    phone_number TEXT,
    result_code TEXT,
    result_description TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}',
    ip_address TEXT,
    signature_valid BOOLEAN,
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_transactions_payment_id ON payment_transactions(payment_id);
CREATE INDEX idx_payment_transactions_order_id ON payment_transactions(order_id);
CREATE INDEX idx_payment_transactions_checkout_request_id ON payment_transactions(checkout_request_id);

-- ============================================================
-- ORDER STATUS HISTORY
-- ============================================================

CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status_id UUID REFERENCES order_statuses(id),
    to_status_id UUID NOT NULL REFERENCES order_statuses(id),
    changed_by UUID,
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_status_history_order_id ON order_status_history(order_id);

-- ============================================================
-- AUDIT LOGS
-- ============================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'customer', 'system', 'webhook')),
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_id UUID,
    old_value JSONB,
    new_value JSONB,
    metadata JSONB NOT NULL DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================
-- ADMIN USERS
-- ============================================================

CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'manager', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_users_auth_user_id ON admin_users(auth_user_id);

-- ============================================================
-- WHATSAPP CONVERSATIONS
-- ============================================================

CREATE TABLE whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL UNIQUE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    current_step TEXT NOT NULL DEFAULT 'BROWSING',
    selected_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    selected_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER,
    delivery_county_id UUID REFERENCES counties(id),
    delivery_method_id UUID REFERENCES delivery_methods(id),
    pickup_point_id UUID REFERENCES pickup_points(id),
    delivery_address JSONB,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    payment_state TEXT,
    last_message_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_conversations_conversation_id ON whatsapp_conversations(conversation_id);
CREATE INDEX idx_whatsapp_conversations_customer_id ON whatsapp_conversations(customer_id);
CREATE INDEX idx_whatsapp_conversations_phone_number ON whatsapp_conversations(phone_number);

CREATE TABLE whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_type TEXT NOT NULL DEFAULT 'text',
    from_phone TEXT,
    to_phone TEXT,
    content TEXT,
    payload JSONB NOT NULL DEFAULT '{}',
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_messages_conversation_id ON whatsapp_messages(conversation_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Customers can read/write their own profile, addresses, orders, items, payments.
CREATE POLICY "customers_select_own" ON customers FOR SELECT USING (auth_user_id = auth.uid());
CREATE POLICY "customers_update_own" ON customers FOR UPDATE USING (auth_user_id = auth.uid());

CREATE POLICY "customer_addresses_all_own" ON customer_addresses FOR ALL USING (
    EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_addresses.customer_id AND c.auth_user_id = auth.uid())
);

CREATE POLICY "orders_select_own" ON orders FOR SELECT USING (
    EXISTS (SELECT 1 FROM customers c WHERE c.id = orders.customer_id AND c.auth_user_id = auth.uid())
);
CREATE POLICY "orders_insert_own" ON orders FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM customers c WHERE c.id = orders.customer_id AND c.auth_user_id = auth.uid())
);

CREATE POLICY "order_items_select_own" ON order_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = order_items.order_id AND c.auth_user_id = auth.uid())
);

CREATE POLICY "payments_select_own" ON payments FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = payments.order_id AND c.auth_user_id = auth.uid())
);

CREATE POLICY "payment_transactions_select_own" ON payment_transactions FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = payment_transactions.order_id AND c.auth_user_id = auth.uid())
);

CREATE POLICY "whatsapp_conversations_select_own" ON whatsapp_conversations FOR SELECT USING (
    (customer_id IS NULL AND phone_number IS NOT NULL) OR
    EXISTS (SELECT 1 FROM customers c WHERE c.id = whatsapp_conversations.customer_id AND c.auth_user_id = auth.uid())
);

CREATE POLICY "whatsapp_messages_select_own" ON whatsapp_messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM whatsapp_conversations wc WHERE wc.id = whatsapp_messages.conversation_id AND (
        (wc.customer_id IS NULL) OR
        EXISTS (SELECT 1 FROM customers c WHERE c.id = wc.customer_id AND c.auth_user_id = auth.uid())
    ))
);

-- Public read-only: active catalogue data
CREATE POLICY "scents_public_read" ON scents FOR SELECT USING (active = TRUE);
CREATE POLICY "product_types_public_read" ON product_types FOR SELECT USING (active = TRUE);
CREATE POLICY "products_public_read" ON products FOR SELECT USING (active = TRUE);
CREATE POLICY "product_variants_public_read" ON product_variants FOR SELECT USING (active = TRUE);
CREATE POLICY "product_images_public_read" ON product_images FOR SELECT USING (TRUE);
CREATE POLICY "pricing_tiers_public_read" ON pricing_tiers FOR SELECT USING (active = TRUE);
CREATE POLICY "counties_public_read" ON counties FOR SELECT USING (active = TRUE);
CREATE POLICY "delivery_methods_public_read" ON delivery_methods FOR SELECT USING (active = TRUE);
CREATE POLICY "pickup_points_public_read" ON pickup_points FOR SELECT USING (active = TRUE);
CREATE POLICY "delivery_rates_public_read" ON delivery_rates FOR SELECT USING (active = TRUE);

-- Admin-only access for management tables (enforced via admin_users + service role)
CREATE POLICY "admin_full_products" ON products FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users a WHERE a.auth_user_id = auth.uid() AND a.is_active = TRUE)
);
CREATE POLICY "admin_full_variants" ON product_variants FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users a WHERE a.auth_user_id = auth.uid() AND a.is_active = TRUE)
);
CREATE POLICY "admin_full_orders" ON orders FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users a WHERE a.auth_user_id = auth.uid() AND a.is_active = TRUE)
);

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := 'DB-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(NEW::TEXT FROM 1 FOR 8));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_number BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION set_order_number();

CREATE OR REPLACE FUNCTION ensure_inventory()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO inventory (variant_id, quantity_on_hand, reserved_quantity, version)
    VALUES (NEW.id, 0, 0, 1)
    ON CONFLICT (variant_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_variants_inventory AFTER INSERT ON product_variants FOR EACH ROW EXECUTE FUNCTION ensure_inventory();

CREATE OR REPLACE FUNCTION ensure_default_pricing()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO pricing_tiers (variant_id, customer_type_id, minimum_quantity, maximum_quantity, price, active)
    SELECT NEW.id, ct.id, 1, NULL, NEW.retail_price, TRUE
    FROM customer_types ct
    WHERE ct.slug = 'retail'
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_variants_pricing AFTER INSERT ON product_variants FOR EACH ROW EXECUTE FUNCTION ensure_default_pricing();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('scents','product_types','counties','delivery_methods','customer_types','products','product_variants','pricing_tiers','customers','customer_addresses','pickup_points','delivery_rates','business_settings','wholesale_settings','orders','payments','payment_transactions','whatsapp_conversations','admin_users') LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;', t, t);
        EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at();', t, t);
    END LOOP;
END;
$$;

-- ============================================================
-- STATUS TRANSITION GUARD
-- Enforces backend-controlled status changes (§7, §11)
-- ============================================================

CREATE TABLE order_status_transitions (
    from_status_id UUID REFERENCES order_statuses(id),
    to_status_id UUID NOT NULL REFERENCES order_statuses(id),
    PRIMARY KEY (from_status_id, to_status_id)
);

INSERT INTO order_status_transitions (from_status_id, to_status_id)
SELECT f.id, t.id FROM order_statuses f, order_statuses t
WHERE (f.slug, t.slug) IN (
    ('draft', 'pending_checkout'),
    ('draft', 'cancelled'),
    ('pending_checkout', 'awaiting_payment'),
    ('pending_checkout', 'payment_failed'),
    ('pending_checkout', 'cancelled'),
    ('awaiting_payment', 'payment_processing'),
    ('awaiting_payment', 'payment_failed'),
    ('awaiting_payment', 'cancelled'),
    ('payment_processing', 'paid'),
    ('payment_processing', 'payment_failed'),
    ('paid', 'confirmed'),
    ('paid', 'refunded'),
    ('paid', 'cancelled'),
    ('confirmed', 'processing'),
    ('confirmed', 'cancelled'),
    ('processing', 'ready_for_dispatch'),
    ('processing', 'cancelled'),
    ('ready_for_dispatch', 'dispatched'),
    ('dispatched', 'delivered'),
    ('dispatched', 'cancelled'),
    ('payment_failed', 'cancelled'),
    ('cancelled', 'refunded')
);

-- Enforce the transition matrix server-side. Returns TRUE on success,
-- raises on invalid transition. Records history on every change.
CREATE OR REPLACE FUNCTION transition_order_status(p_order_id UUID, p_to_status_slug TEXT, p_changed_by UUID, p_reason TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_from_status_id UUID;
    v_to_status_id UUID;
    v_allowed BOOLEAN;
BEGIN
    SELECT id INTO v_to_status_id FROM order_statuses WHERE slug = p_to_status_slug;
    IF v_to_status_id IS NULL THEN
        RAISE EXCEPTION 'Unknown status slug: %', p_to_status_slug;
    END IF;

    SELECT status_id INTO v_from_status_id FROM orders WHERE id = p_order_id FOR UPDATE;
    IF v_from_status_id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_from_status_id = v_to_status_id THEN
        RETURN TRUE;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM order_status_transitions
        WHERE from_status_id = v_from_status_id AND to_status_id = v_to_status_id
    ) INTO v_allowed;

    IF NOT v_allowed THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', v_from_status_id, v_to_status_id;
    END IF;

    UPDATE orders SET status_id = v_to_status_id WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by, change_reason)
    VALUES (p_order_id, v_from_status_id, v_to_status_id, p_changed_by, p_reason);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
-- add customer lookup helper
CREATE OR REPLACE FUNCTION ensure_customer(
  p_phone TEXT,
  p_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_customer_type TEXT DEFAULT 'retail'
) RETURNS JSONB AS $$
DECLARE
  c_id UUID;
  ct_id UUID;
BEGIN
  SELECT id INTO c_id FROM customers WHERE phone = p_phone;
  IF c_id IS NULL THEN
    SELECT id INTO ct_id FROM customer_types WHERE slug = p_customer_type;
    INSERT INTO customers (auth_user_id, name, phone, email, customer_type_id, is_wholesale)
    VALUES (NULL, p_name, p_phone, p_email, ct_id, p_customer_type = 'wholesale')
    RETURNING id INTO c_id;
  END IF;
  RETURN jsonb_build_object('id', c_id, 'phone', p_phone);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
