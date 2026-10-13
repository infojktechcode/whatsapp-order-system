- Verify RLS policies and transitions.
-- Run with: supabase db push && psql -f verify_rls.sql
-- Or via supabase db execute.

-- 1. Verify all 23 policies are active
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 2. Verify 22 allowed transitions exist
SELECT f.slug AS from_status, t.slug AS to_status
FROM order_status_transitions ost
JOIN order_statuses f ON f.id = ost.from_status_id
JOIN order_statuses t ON t.id = ost.to_status_id
ORDER BY f.sort_order, t.sort_order;

-- 3. Verify no forbidden transitions exist (e.g., draft -> delivered)
SELECT f.slug AS from_status, t.slug AS to_status
FROM order_status_transitions ost
JOIN order_statuses f ON f.id = ost.from_status_id
JOIN order_statuses t ON t.id = ost.to_status_id
WHERE f.slug = 'draft' AND t.slug IN ('paid', 'confirmed', 'processing', 'ready_for_dispatch', 'dispatched', 'delivered');

-- 4. Stock reservations exist and the ledger table has RLS on
--    (migration 0005: without it the catalogue can be oversold)
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_reserve_stock')             AS reserve_trigger,
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_release_stock_on_delete')  AS delete_trigger,
  (SELECT count(*) FROM order_status_transitions)                                  AS transition_matrix_rows,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'stock_reservations')           AS ledger_exists,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'stock_reservations')       AS ledger_rls;

-- 5. Reservations must never outlive the stock they hold: anything still
--    'reserved' whose order was deleted or delivered is a leak worth chasing.
SELECT sr.order_id, sr.variant_id, sr.quantity, sr.state
FROM stock_reservations sr
LEFT JOIN orders o ON o.id = sr.order_id
WHERE sr.state = 'reserved' AND o.id IS NULL;

-- 6. INVARIANT: inventory.reserved_quantity must equal the sum of 'reserved'
--    ledger rows. Any row here is drift (e.g. a cleanup script that removed
--    ledger rows before deleting the order, bypassing the release trigger)
--    and means stock is silently locked out of sale.
SELECT i.variant_id,
       i.reserved_quantity AS inventory_says,
       COALESCE(SUM(sr.quantity) FILTER (WHERE sr.state = 'reserved'), 0)::INTEGER AS ledger_says
FROM inventory i
LEFT JOIN stock_reservations sr ON sr.variant_id = i.variant_id
GROUP BY i.variant_id, i.reserved_quantity
HAVING i.reserved_quantity <> COALESCE(SUM(sr.quantity) FILTER (WHERE sr.state = 'reserved'), 0)::INTEGER;
