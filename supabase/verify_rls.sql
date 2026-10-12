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
