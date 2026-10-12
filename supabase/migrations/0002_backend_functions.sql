-- 0002_backend_functions.sql
-- Server-side checkout + M-Pesa result handling, callable only by the
-- Edge Functions (service role). Applied after 0001_initial_schema.sql.
--
-- Rules enforced here (AGENTS.md §3):
--   * Prices, delivery fees, discounts and totals are computed ONLY here.
--     The browser never sends them; it cannot call these functions directly.
--   * The only path to PAID is mpesa_handle_result(), invoked by the
--     mpesa-callback Edge Function after validating a Daraja callback.
--   * Status transitions stay backend-controlled via transition_order_status().

-- ============================================================
-- 1. Order number format
-- 0001 generated "DB-YYYYMMDD-(A1B2C3D4" (row-text artefacts).
-- Use the id instead: DB-YYYYMMDD-A1B2C3
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := 'DB-' || TO_CHAR(NOW(), 'YYYYMMDD')
                          || '-' || UPPER(LEFT(REPLACE(NEW.id::TEXT, '-', ''), 6));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Retryable payment failure
-- A customer must be able to request a new STK push after a
-- failed attempt (mpesa-stk runs payment_failed -> awaiting_payment
-- -> payment_processing).
-- ============================================================
INSERT INTO order_status_transitions (from_status_id, to_status_id)
SELECT f.id, t.id FROM order_statuses f, order_statuses t
WHERE (f.slug, t.slug) = ('payment_failed', 'awaiting_payment')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. create_order — the one transactional checkout path
--
-- p_items:    [{"variant_id": "<uuid>", "quantity": 2}, ...]
-- p_customer: {"phone": "2547...", "name": "...", "email": "..."}
-- p_delivery: {"type": "pickup|courier|bus", "county_id": "<uuid>",
--              "method_id": "<uuid>", "pickup_point_id": "<uuid>",
--              "address": {...} | "text"}
--
-- Computes unit prices (wholesale / pricing_tiers / retail), stock
-- availability, delivery fee from delivery_rates and discount from
-- wholesale_settings, then writes orders + order_items atomically.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_order(
    p_items JSONB,
    p_customer JSONB,
    p_delivery JSONB,
    p_channel TEXT DEFAULT 'web',
    p_customer_type TEXT DEFAULT 'retail',
    p_customer_notes TEXT DEFAULT NULL
) RETURNS JSONB
AS $$
DECLARE
    v_item              JSONB;
    v_variant           RECORD;
    v_tier              RECORD;
    v_rate              RECORD;
    v_line              JSONB;
    v_lines             JSONB := '[]'::jsonb;
    v_requested         JSONB := '{}'::jsonb;
    v_phone             TEXT;
    v_name              TEXT;
    v_email             TEXT;
    v_customer_id       UUID;
    v_delivery_type     TEXT;
    v_county_id         UUID;
    v_method_id         UUID;
    v_pickup_id         UUID;
    v_address           JSONB;
    v_method_slug       TEXT;
    v_delivery_fee      INTEGER := 0;
    v_min_total         INTEGER;
    v_subtotal          INTEGER := 0;
    v_discount          INTEGER := 0;
    v_qty_total         INTEGER := 0;
    v_qty               INTEGER;
    v_prev_qty          INTEGER;
    v_unit_price        INTEGER;
    v_tier_name         TEXT;
    v_stock             INTEGER;
    v_order_id          UUID;
    v_order_number      TEXT;
    v_status_id         UUID;
    v_expiry_hours      INTEGER := 24;
    v_ct_id             UUID;
    v_ws                RECORD;
BEGIN
    -- ---------- input shape (defence in depth; the Edge Function validates first) ----------
    IF p_items IS NULL OR JSONB_TYPEOF(p_items) <> 'array'
       OR JSONB_ARRAY_LENGTH(p_items) = 0 OR JSONB_ARRAY_LENGTH(p_items) > 50 THEN
        RAISE EXCEPTION 'items must be a non-empty array of at most 50 lines';
    END IF;
    IF p_customer_type NOT IN ('retail', 'wholesale') THEN
        RAISE EXCEPTION 'customer_type must be retail or wholesale';
    END IF;

    v_phone := NULLIF(TRIM(COALESCE(p_customer->>'phone', '')), '');
    IF v_phone IS NULL OR v_phone !~ '^254[17]\d{8}$' THEN
        RAISE EXCEPTION 'A valid phone number (2547XXXXXXXX / 2541XXXXXXXX) is required';
    END IF;
    v_name := COALESCE(NULLIF(TRIM(COALESCE(p_customer->>'name', '')), ''), v_phone);
    v_email := NULLIF(TRIM(COALESCE(p_customer->>'email', '')), '');

    v_delivery_type := COALESCE(p_delivery->>'type', 'pickup');
    IF v_delivery_type NOT IN ('pickup', 'courier', 'bus') THEN
        RAISE EXCEPTION 'delivery type must be pickup, courier or bus';
    END IF;
    v_county_id  := CASE WHEN (p_delivery->>'county_id') IS NULL THEN NULL
                         ELSE (p_delivery->>'county_id')::UUID END;
    v_method_id  := CASE WHEN (p_delivery->>'method_id') IS NULL THEN NULL
                         ELSE (p_delivery->>'method_id')::UUID END;
    v_pickup_id  := CASE WHEN (p_delivery->>'pickup_point_id') IS NULL THEN NULL
                         ELSE (p_delivery->>'pickup_point_id')::UUID END;
    v_address    := p_delivery->'address';

    SELECT id INTO v_ct_id FROM customer_types WHERE slug = p_customer_type;
    IF v_ct_id IS NULL THEN
        RAISE EXCEPTION 'Unknown customer type: %', p_customer_type;
    END IF;

    -- ---------- price every line from the database ----------
    FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items) AS t(elem)
    LOOP
        v_qty := (v_item->>'quantity')::INTEGER;
        IF v_qty IS NULL OR v_qty < 1 OR v_qty > 500 THEN
            RAISE EXCEPTION 'Quantity must be between 1 and 500';
        END IF;

        -- lock the variant (ordered by id to keep lock order deterministic)
        SELECT pv.id, pv.product_id, pv.retail_price, pv.wholesale_price,
               pv.wholesale_threshold, pv.stock_quantity, pv.sku, pv.size, p.active AS product_active
          INTO v_variant
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
         WHERE pv.id = (v_item->>'variant_id')::UUID
         ORDER BY pv.id
         FOR UPDATE OF pv;

        IF v_variant.id IS NULL THEN
            RAISE EXCEPTION 'Variant not found: %', v_item->>'variant_id';
        END IF;
        IF NOT v_variant.product_active THEN
            RAISE EXCEPTION 'Product is not available';
        END IF;

        -- cumulative stock check across repeated lines of the same variant
        v_prev_qty := COALESCE((v_requested->>v_variant.id::TEXT)::INTEGER, 0);
        v_requested := v_requested || jsonb_build_object(v_variant.id::TEXT, v_prev_qty + v_qty);

        SELECT COALESCE(i.quantity_on_hand - i.reserved_quantity, v_variant.stock_quantity)
          INTO v_stock
          FROM inventory i
         WHERE i.variant_id = v_variant.id;
        IF NOT FOUND THEN
            v_stock := v_variant.stock_quantity;
        END IF;
        IF (v_prev_qty + v_qty) > v_stock THEN
            RAISE EXCEPTION 'Insufficient stock for SKU % (available %)', v_variant.sku, v_stock;
        END IF;

        -- pricing precedence: wholesale -> qualifying pricing tier -> retail
        IF p_customer_type = 'wholesale'
           AND v_qty >= v_variant.wholesale_threshold
           AND v_variant.wholesale_price > 0 THEN
            v_unit_price := v_variant.wholesale_price;
            v_tier_name := 'wholesale';
        ELSE
            SELECT pt.id, pt.price INTO v_tier
              FROM pricing_tiers pt
             WHERE pt.variant_id = v_variant.id
               AND pt.customer_type_id = v_ct_id
               AND pt.active = TRUE
               AND pt.minimum_quantity <= v_qty
               AND (pt.maximum_quantity IS NULL OR pt.maximum_quantity >= v_qty)
             ORDER BY pt.minimum_quantity DESC
             LIMIT 1;
            IF FOUND THEN
                v_unit_price := v_tier.price;
                v_tier_name := 'tier-' || v_tier.id;
            ELSE
                v_unit_price := v_variant.retail_price;
                v_tier_name := 'retail';
            END IF;
        END IF;

        v_line := jsonb_build_object(
            'variant_id', v_variant.id,
            'quantity', v_qty,
            'unit_price', v_unit_price,
            'pricing_tier', v_tier_name,
            'line_total', v_unit_price * v_qty
        );
        v_lines := v_lines || jsonb_build_array(v_line);
        v_subtotal := v_subtotal + (v_unit_price * v_qty);
        v_qty_total := v_qty_total + v_qty;
    END LOOP;

    -- ---------- delivery fee from delivery_rates (never from the client) ----------
    IF v_method_id IS NOT NULL THEN
        SELECT slug INTO v_method_slug FROM delivery_methods WHERE id = v_method_id AND active = TRUE;
        IF v_method_slug IS NULL THEN
            RAISE EXCEPTION 'Unknown or inactive delivery method';
        END IF;

        IF v_county_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM counties WHERE id = v_county_id AND active = TRUE) THEN
            RAISE EXCEPTION 'Unknown or inactive county';
        END IF;

        IF v_pickup_id IS NOT NULL THEN
            IF v_county_id IS NULL THEN
                SELECT county_id INTO v_county_id
                  FROM pickup_points WHERE id = v_pickup_id AND active = TRUE;
                IF v_county_id IS NULL THEN
                    RAISE EXCEPTION 'Unknown or inactive pickup point';
                END IF;
            END IF;
        END IF;

        IF v_pickup_id IS NOT NULL OR v_county_id IS NOT NULL THEN
            -- a configured pickup-point rate wins; otherwise county + method
            -- (rates are matched by pickup point first: seed rows may sit in the
            --  parent county while the point itself is listed under its town)
            SELECT fee, minimum_order_total INTO v_rate
              FROM delivery_rates
             WHERE active = TRUE
               AND delivery_method_id = v_method_id
               AND (pickup_point_id = v_pickup_id
                    OR (v_pickup_id IS NULL AND pickup_point_id IS NULL AND county_id = v_county_id))
               AND minimum_order_total <= v_subtotal
             ORDER BY fee ASC
             LIMIT 1;

            IF FOUND THEN
                v_delivery_fee := v_rate.fee;
            ELSIF v_method_slug = 'pickup' THEN
                v_delivery_fee := 0;  -- pickup stays free unless a rate applies
            ELSE
                SELECT MIN(minimum_order_total) INTO v_min_total
                  FROM delivery_rates
                 WHERE active = TRUE
                   AND delivery_method_id = v_method_id
                   AND (pickup_point_id = v_pickup_id
                        OR (v_pickup_id IS NULL AND pickup_point_id IS NULL AND county_id = v_county_id));
                IF v_min_total IS NULL THEN
                    RAISE EXCEPTION 'No delivery rate is configured for the selected county and method';
                ELSE
                    RAISE EXCEPTION 'This delivery option requires a minimum order of KES %', v_min_total;
                END IF;
            END IF;
        ELSIF v_delivery_type = 'pickup' THEN
            v_delivery_fee := 0;  -- generic pickup: agent confirms point/fee on handover
        ELSE
            RAISE EXCEPTION 'A county is required for % delivery', v_delivery_type;
        END IF;
    END IF;

    -- ---------- wholesale discount from wholesale_settings (centralised rule) ----------
    SELECT ws.discount_type, ws.discount_value INTO v_ws
      FROM wholesale_settings ws
     WHERE ws.customer_type_id = v_ct_id
       AND ws.active = TRUE
       AND ws.minimum_quantity <= v_qty_total;
    IF FOUND THEN
        IF v_ws.discount_type = 'percent' THEN
            v_discount := (v_subtotal * v_ws.discount_value) / 100;
        ELSE
            v_discount := LEAST(v_ws.discount_value, v_subtotal);
        END IF;
    END IF;

    -- ---------- customer (shared guest/registered path) ----------
    SELECT ((ensure_customer(v_phone, v_name, v_email, p_customer_type))->>'id')::UUID
      INTO v_customer_id;

    -- ---------- status + expiry (business_settings) ----------
    SELECT id INTO v_status_id FROM order_statuses WHERE slug = 'awaiting_payment';
    IF v_status_id IS NULL THEN
        RAISE EXCEPTION 'order_statuses is missing the awaiting_payment row — run 0001 + seed';
    END IF;

    SELECT COALESCE((value->>'value')::INTEGER, 24) INTO v_expiry_hours
      FROM business_settings WHERE key = 'order_expiry_hours';
    IF NOT FOUND OR v_expiry_hours IS NULL OR v_expiry_hours < 1 THEN
        v_expiry_hours := 24;
    END IF;

    -- ---------- write the order + items in one transaction ----------
    INSERT INTO orders (
        customer_id, status_id, channel, delivery_type,
        delivery_county_id, delivery_method_id, pickup_point_id, delivery_address,
        delivery_fee, subtotal, discount, total, customer_notes, expires_at
    ) VALUES (
        v_customer_id, v_status_id, p_channel, v_delivery_type,
        v_county_id, v_method_id, v_pickup_id, v_address,
        v_delivery_fee, v_subtotal, v_discount,
        v_subtotal + v_delivery_fee - v_discount,
        NULLIF(TRIM(COALESCE(p_customer_notes, '')), ''),
        NOW() + make_interval(hours => v_expiry_hours)
    )
    RETURNING id, order_number INTO v_order_id, v_order_number;

    INSERT INTO order_items (order_id, variant_id, quantity, unit_price, pricing_tier, line_total)
    SELECT v_order_id,
           (line->>'variant_id')::UUID,
           (line->>'quantity')::INTEGER,
           (line->>'unit_price')::INTEGER,
           line->>'pricing_tier',
           (line->>'line_total')::INTEGER
      FROM JSONB_ARRAY_ELEMENTS(v_lines) AS t(line);

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal', v_subtotal,
        'discount', v_discount,
        'delivery_fee', v_delivery_fee,
        'total', v_subtotal + v_delivery_fee - v_discount,
        'items', v_lines
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. mpesa_handle_result — the ONLY path to PAID
--
-- Called by the mpesa-callback Edge Function inside one transaction:
--   * idempotent — a callback for an already-final payment changes nothing
--   * verifies the callback amount against payment.amount AND order.total
--   * writes the payment audit trail (payment_transactions)
--   * moves the order through transition_order_status()
-- ============================================================
CREATE OR REPLACE FUNCTION public.mpesa_handle_result(
    p_checkout_request_id TEXT,
    p_success BOOLEAN,
    p_result_code TEXT,
    p_result_description TEXT,
    p_mpesa_receipt TEXT,
    p_amount INTEGER,
    p_phone TEXT,
    p_raw_payload JSONB
) RETURNS JSONB
AS $$
DECLARE
    v_payment       RECORD;
    v_order_total   INTEGER;
    v_status        TEXT;
    v_order_id      UUID;
    v_reason        TEXT := NULL;
    v_valid         BOOLEAN := TRUE;
BEGIN
    IF p_checkout_request_id IS NULL OR p_checkout_request_id = '' THEN
        RAISE EXCEPTION 'checkout_request_id is required';
    END IF;

    SELECT p.id, p.order_id, p.status, p.amount, o.total AS order_total
      INTO v_payment
      FROM payments p
      JOIN orders o ON o.id = p.order_id
     WHERE p.checkout_request_id = p_checkout_request_id
     FOR UPDATE OF p;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', FALSE);
    END IF;
    v_order_id := v_payment.order_id;
    v_order_total := v_payment.order_total;

    -- attempt-level idempotency: this exact callback was already applied.
    -- (Keyed on checkout_request_id so a *retried* STK attempt can still settle —
    --  payment.status alone would be stale after payment_failed -> retry.)
    IF EXISTS (
        SELECT 1 FROM payment_transactions pt
         WHERE pt.payment_id = v_payment.id
           AND pt.transaction_type = 'callback'
           AND pt.checkout_request_id = p_checkout_request_id
           AND pt.processed = TRUE
    ) THEN
        RETURN jsonb_build_object('found', TRUE, 'idempotent', TRUE, 'status', v_payment.status);
    END IF;

    -- a settled payment is never re-processed
    IF v_payment.status IN ('completed', 'cancelled', 'refunded') THEN
        RETURN jsonb_build_object('found', TRUE, 'idempotent', TRUE, 'status', v_payment.status);
    END IF;

    -- amount verification: the callback must match what we asked for
    IF p_success AND (p_amount IS DISTINCT FROM v_payment.amount
                      OR p_amount IS DISTINCT FROM v_order_total) THEN
        v_valid := FALSE;
        v_reason := format('amount mismatch: callback %s, payment %s, order %s',
                           p_amount, v_payment.amount, v_order_total);
        p_success := FALSE;
        p_result_code := COALESCE(p_result_code, '0');
        p_result_description := v_reason;
    END IF;

    -- audit trail for every callback we process
    INSERT INTO payment_transactions (
        payment_id, order_id, transaction_type, checkout_request_id,
        merchant_request_id, mpesa_receipt_number, amount, phone_number,
        result_code, result_description, raw_payload, signature_valid, processed
    ) VALUES (
        v_payment.id, v_order_id, 'callback', p_checkout_request_id,
        NULL, p_mpesa_receipt, p_amount, p_phone,
        p_result_code, p_result_description, COALESCE(p_raw_payload, '{}'::jsonb),
        v_valid, v_valid
    );

    IF NOT v_valid THEN
        -- fail closed: a mismatched callback must never mark an order PAID
        UPDATE payments
           SET status = 'failed', result_code = 'amount_mismatch',
               result_description = v_reason, updated_at = NOW()
         WHERE id = v_payment.id;

        SELECT os.slug INTO v_status
          FROM orders o JOIN order_statuses os ON os.id = o.status_id
         WHERE o.id = v_order_id;
        IF v_status IN ('awaiting_payment', 'payment_processing') THEN
            PERFORM transition_order_status(v_order_id, 'payment_failed', NULL, v_reason);
        END IF;

        INSERT INTO audit_logs (actor_type, action, resource, resource_id, metadata)
        VALUES ('webhook', 'mpesa_callback_amount_mismatch', 'payments', v_payment.id,
                jsonb_build_object('reason', v_reason,
                                   'checkout_request_id', p_checkout_request_id));

        RETURN jsonb_build_object('found', TRUE, 'status', 'failed', 'reason', 'amount_mismatch');
    END IF;

    IF p_success THEN
        UPDATE payments
           SET status = 'completed',
               mpesa_receipt_number = p_mpesa_receipt,
               result_code = COALESCE(p_result_code, '0'),
               result_description = p_result_description,
               phone_number = COALESCE(p_phone, phone_number),
               completed_at = NOW(), updated_at = NOW()
         WHERE id = v_payment.id;

        UPDATE orders SET paid_at = COALESCE(paid_at, NOW()) WHERE id = v_order_id;

        SELECT os.slug INTO v_status
          FROM orders o JOIN order_statuses os ON os.id = o.status_id
         WHERE o.id = v_order_id;

        -- walk the transition matrix up to paid, one legal step at a time
        IF v_status = 'payment_failed' THEN
            PERFORM transition_order_status(v_order_id, 'awaiting_payment', NULL, 'payment retried');
            v_status := 'awaiting_payment';
        END IF;
        IF v_status = 'awaiting_payment' THEN
            PERFORM transition_order_status(v_order_id, 'payment_processing', NULL, 'Daraja callback accepted');
            v_status := 'payment_processing';
        END IF;
        IF v_status = 'payment_processing' THEN
            PERFORM transition_order_status(v_order_id, 'paid', NULL,
                'M-Pesa receipt ' || COALESCE(p_mpesa_receipt, 'n/a'));
        END IF;

        INSERT INTO audit_logs (actor_type, action, resource, resource_id, metadata)
        VALUES ('webhook', 'mpesa_payment_confirmed', 'orders', v_order_id,
                jsonb_build_object('receipt', p_mpesa_receipt, 'amount', p_amount,
                                   'checkout_request_id', p_checkout_request_id));

        RETURN jsonb_build_object('found', TRUE, 'status', 'completed');
    END IF;

    -- callback reported failure (timeout, insufficient funds, cancelled by customer)
    UPDATE payments
       SET status = 'failed',
           result_code = p_result_code,
           result_description = p_result_description,
           phone_number = COALESCE(p_phone, phone_number),
           updated_at = NOW()
     WHERE id = v_payment.id;

    SELECT os.slug INTO v_status
      FROM orders o JOIN order_statuses os ON os.id = o.status_id
     WHERE o.id = v_order_id;
    IF v_status IN ('awaiting_payment', 'payment_processing') THEN
        PERFORM transition_order_status(v_order_id, 'payment_failed', NULL, p_result_description);
    END IF;

    INSERT INTO audit_logs (actor_type, action, resource, resource_id, metadata)
    VALUES ('webhook', 'mpesa_payment_failed', 'orders', v_order_id,
            jsonb_build_object('result_code', p_result_code,
                               'result_description', p_result_description,
                               'checkout_request_id', p_checkout_request_id));

    RETURN jsonb_build_object('found', TRUE, 'status', 'failed');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Privileges — the browser must never execute these
-- (functions default to PUBLIC EXECUTE in Postgres)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.create_order(JSONB, JSONB, JSONB, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, JSONB, JSONB, TEXT, TEXT, TEXT)
    TO service_role;

REVOKE EXECUTE ON FUNCTION public.mpesa_handle_result(TEXT, BOOLEAN, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mpesa_handle_result(TEXT, BOOLEAN, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB)
    TO service_role;

-- A signed-in customer must not be able to call transition_order_status()
-- on their own order (awaiting_payment -> paid would be a free order).
REVOKE EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, UUID, TEXT)
    TO service_role;

-- ensure_customer is still needed by authenticated flows, but not by the open internet.
REVOKE EXECUTE ON FUNCTION public.ensure_customer(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_customer(TEXT, TEXT, TEXT, TEXT)
    TO authenticated, service_role;

-- ============================================================
-- 6. Orders are written server-side only
-- Checkout runs through create_order() (service role). The per-customer
-- INSERT policy would have let any signed-in user write forged totals.
-- ============================================================
DROP POLICY IF EXISTS "orders_insert_own" ON orders;
