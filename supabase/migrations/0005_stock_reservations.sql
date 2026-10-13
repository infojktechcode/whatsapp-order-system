-- ============================================================
-- 0005 — Stock reservations (overselling fix)
-- ============================================================
--
-- BUG: create_order() read stock
--     COALESCE(inventory.quantity_on_hand - inventory.reserved_quantity,
--              product_variants.stock_quantity)
-- but nothing ever WROTE to inventory. reserved_quantity stayed 0 forever and
-- quantity_on_hand never moved, so any number of orders could each pass the
-- "enough stock?" check for the same units and all succeed — the catalogue
-- could be oversold arbitrarily. Two concurrent checkouts also raced, because
-- nothing was locked between the check and the order write.
--
-- MODEL (inventory is the single source of truth; the rules live in one
-- function so no caller can invent its own):
--
--   order_items INSERT   -> RESERVE  (reserved_quantity += qty, stock stays on hand)
--   -> delivered         -> CONSUME  (reserved -= qty, on_hand -= qty)
--   -> cancelled / payment_failed / refunded
--                        -> RELEASE  (reserved -= qty) while still reserved
--   refunded after delivery
--                        -> RESTORE  (on_hand += qty) if it was consumed
--
-- create_order() itself is deliberately NOT modified. The reservation rides on
-- an AFTER INSERT trigger on order_items, so it runs inside the same
-- transaction as the order write (any failure rolls the order back) and takes
-- a row lock on inventory — closing the check-then-act race between two
-- concurrent checkouts for the last units.
--
-- Every status change funnels through transition_order_status(), which calls
-- apply_stock_for_status() — admin actions, WhatsApp and the Daraja callback all
-- get identical stock behaviour. The state column makes each reservation
-- settle exactly once (release/consume only fire from 'reserved').

CREATE TABLE IF NOT EXISTS stock_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    state TEXT NOT NULL DEFAULT 'reserved'
        CHECK (state IN ('reserved', 'released', 'consumed', 'restored')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_order ON stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_variant_state
    ON stock_reservations(variant_id, state);

ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;

-- Operators may look at reservations; nobody writes them from a client.
DROP POLICY IF EXISTS "stock_reservations_admin_read" ON stock_reservations;
CREATE POLICY "stock_reservations_admin_read" ON stock_reservations
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM admin_users a
            WHERE a.auth_user_id = auth.uid() AND a.is_active = TRUE
        )
    );

-- ============================================================
-- 1. reserve one order line (trigger on order_items)
-- ============================================================
CREATE OR REPLACE FUNCTION reserve_stock_on_order_item()
RETURNS TRIGGER AS $$
DECLARE
    v_available INTEGER;
    v_sku TEXT;
BEGIN
    -- Self-heal: a catalogue variant added without an inventory row starts from
    -- its catalogue stock, so later reads and this trigger share one row.
    INSERT INTO inventory (variant_id, quantity_on_hand, reserved_quantity)
    SELECT NEW.variant_id, pv.stock_quantity, 0
      FROM product_variants pv
     WHERE pv.id = NEW.variant_id
    ON CONFLICT (variant_id) DO NOTHING;

    -- Lock the row: concurrent checkouts for the last units serialise here.
    SELECT quantity_on_hand - reserved_quantity INTO v_available
      FROM inventory
     WHERE variant_id = NEW.variant_id
       FOR UPDATE;

    IF NEW.quantity > v_available THEN
        SELECT sku INTO v_sku FROM product_variants WHERE id = NEW.variant_id;
        RAISE EXCEPTION 'Insufficient stock for SKU % (available %)', COALESCE(v_sku, NEW.variant_id), v_available;
    END IF;

    UPDATE inventory
       SET reserved_quantity = reserved_quantity + NEW.quantity,
           version = version + 1,
           updated_at = NOW()
     WHERE variant_id = NEW.variant_id;

    INSERT INTO stock_reservations (order_id, variant_id, quantity, state)
    VALUES (NEW.order_id, NEW.variant_id, NEW.quantity, 'reserved')
    ON CONFLICT (order_id, variant_id) DO UPDATE
        SET quantity = stock_reservations.quantity + EXCLUDED.quantity,
            state = 'reserved',
            updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reserve_stock ON order_items;
CREATE TRIGGER trg_reserve_stock
    AFTER INSERT ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION reserve_stock_on_order_item();

-- ============================================================
-- 1b. hard-deleting an order must not leak its reservation
-- ============================================================
-- Orders are deletable (admin cleanup, data-erasure requests). Without this the
-- reservation would vanish with the cascade while inventory.reserved_quantity
-- kept the units locked out of sale forever.
CREATE OR REPLACE FUNCTION release_stock_on_order_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_res RECORD;
BEGIN
    FOR v_res IN
        SELECT variant_id, quantity FROM stock_reservations
         WHERE order_id = OLD.id AND state = 'reserved'
    LOOP
        UPDATE inventory
           SET reserved_quantity = GREATEST(0, reserved_quantity - v_res.quantity),
               version = version + 1,
               updated_at = NOW()
         WHERE variant_id = v_res.variant_id;
    END LOOP;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_release_stock_on_delete ON orders;
CREATE TRIGGER trg_release_stock_on_delete
    BEFORE DELETE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION release_stock_on_order_delete();

-- ============================================================
-- 2. apply_stock_for_status — called by transition_order_status()
-- ============================================================
CREATE OR REPLACE FUNCTION apply_stock_for_status(
    p_order_id UUID,
    p_to_slug TEXT
)
RETURNS VOID AS $$
DECLARE
    v_res RECORD;
BEGIN
    IF p_to_slug IS NULL THEN
        RETURN;
    END IF;

    -- reserved -> released: the units go back on sale (no money completed,
    -- or the money was returned). Settles once: only 'reserved' rows match.
    IF p_to_slug IN ('cancelled', 'payment_failed', 'refunded') THEN
        FOR v_res IN
            SELECT variant_id, quantity FROM stock_reservations
             WHERE order_id = p_order_id AND state = 'reserved'
             FOR UPDATE
        LOOP
            UPDATE inventory
               SET reserved_quantity = GREATEST(0, reserved_quantity - v_res.quantity),
                   version = version + 1,
                   updated_at = NOW()
             WHERE variant_id = v_res.variant_id;

            UPDATE stock_reservations
               SET state = 'released', updated_at = NOW()
             WHERE order_id = p_order_id AND variant_id = v_res.variant_id;
        END LOOP;
    END IF;

    -- reserved -> consumed: the goods left the building.
    IF p_to_slug = 'delivered' THEN
        FOR v_res IN
            SELECT variant_id, quantity FROM stock_reservations
             WHERE order_id = p_order_id AND state = 'reserved'
             FOR UPDATE
        LOOP
            UPDATE inventory
               SET reserved_quantity = GREATEST(0, reserved_quantity - v_res.quantity),
                   quantity_on_hand = GREATEST(0, quantity_on_hand - v_res.quantity),
                   version = version + 1,
                   updated_at = NOW()
             WHERE variant_id = v_res.variant_id;

            UPDATE stock_reservations
               SET state = 'consumed', updated_at = NOW()
             WHERE order_id = p_order_id AND variant_id = v_res.variant_id;
        END LOOP;
    END IF;

    -- refunded after delivery -> the goods come back to the shelf.
    IF p_to_slug = 'refunded' THEN
        FOR v_res IN
            SELECT variant_id, quantity FROM stock_reservations
             WHERE order_id = p_order_id AND state = 'consumed'
             FOR UPDATE
        LOOP
            UPDATE inventory
               SET quantity_on_hand = quantity_on_hand + v_res.quantity,
                   version = version + 1,
                   updated_at = NOW()
             WHERE variant_id = v_res.variant_id;

            UPDATE stock_reservations
               SET state = 'restored', updated_at = NOW()
             WHERE order_id = p_order_id AND variant_id = v_res.variant_id;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2b. expiry sweep — an abandoned order must free its stock
-- ============================================================
-- create_order() sets expires_at (business_settings.order_expiry_hours) but
-- nothing acted on it, so a customer who abandons payment would hold their
-- units forever. This cancels expired, unpaid orders through the normal
-- transition function, which releases the reservation and records the history.
CREATE OR REPLACE FUNCTION release_expired_orders(p_limit INTEGER DEFAULT 50)
RETURNS INTEGER AS $$
DECLARE
    v_row RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_row IN
        SELECT o.id
          FROM orders o
          JOIN order_statuses os ON os.id = o.status_id
         WHERE o.expires_at IS NOT NULL
           AND o.expires_at < NOW()
           AND os.slug IN ('awaiting_payment', 'payment_processing')
         ORDER BY o.expires_at ASC
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500))
    LOOP
        BEGIN
            PERFORM transition_order_status(v_row.id, 'cancelled', NULL, 'payment window expired');
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            -- One stuck order must never block the sweep.
            RAISE WARNING 'could not expire order %: %', v_row.id, SQLERRM;
        END;
    END LOOP;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. transition_order_status — unchanged rules, plus the stock hook
-- ============================================================
CREATE OR REPLACE FUNCTION transition_order_status(
    p_order_id UUID, p_to_status_slug TEXT, p_changed_by UUID, p_reason TEXT
)
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

    -- reserve -> release / consume / restore, in the same transaction
    PERFORM apply_stock_for_status(p_order_id, p_to_status_slug);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Privileged functions stay service_role-only (AGENTS.md §3).
REVOKE EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_status(UUID, TEXT, UUID, TEXT)
    TO service_role;

-- The stock helpers are internal: no client may call them directly.
REVOKE EXECUTE ON FUNCTION public.apply_stock_for_status(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_stock_on_order_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_stock_on_order_delete() FROM PUBLIC, anon, authenticated;

-- Called only by the checkout Edge Function (service role) to sweep abandoned orders.
REVOKE EXECUTE ON FUNCTION public.release_expired_orders(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_orders(INTEGER) TO service_role;