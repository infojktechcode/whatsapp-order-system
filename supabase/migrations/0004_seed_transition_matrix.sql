-- ============================================================
-- 0004 — Seed the status transition matrix
-- ============================================================
--
-- BUG: 0001 inserted order_status_transitions with
--   INSERT ... SELECT ... FROM order_statuses f, order_statuses t
-- but the order_statuses rows themselves are seeded in seed.sql, which runs
-- after the migrations. The SELECT therefore matched zero rows and the matrix
-- stayed empty — so transition_order_status() rejected EVERY status change
-- ("Invalid status transition from <uuid> to <uuid>"), including the
-- payment_processing -> paid move that mpesa_handle_result() depends on.
--
-- This re-seeds the matrix from the statuses that now exist. Idempotent.

INSERT INTO order_status_transitions (from_status_id, to_status_id)
SELECT f.id, t.id
FROM order_statuses f, order_statuses t
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
)
ON CONFLICT (from_status_id, to_status_id) DO NOTHING;