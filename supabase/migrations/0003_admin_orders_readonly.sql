-- ============================================================
-- 0003 — Admin orders are read-only for the browser
-- ============================================================
--
-- 0001 granted admins `FOR ALL` on orders via the admin_full_orders policy,
-- which left two holes that AGENTS.md forbids:
--
--   1. An admin session could UPDATE orders.status_id directly, bypassing
--      transition_order_status() — no transition-matrix check, no history row.
--   2. An admin session could UPDATE totals (total/subtotal/delivery_fee),
--      rewriting money figures that create_order() computed.
--
-- Admins read orders (via RLS for direct session queries and via the admin Edge
-- Function with the service role). Every write goes through a server-side
-- function instead: totals from create_order(), status from
-- transition_order_status() (called only by the admin Edge Function, which also
-- writes an audit_logs row).
--
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "admin_full_orders" ON orders;

CREATE POLICY "admin_select_orders" ON orders FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM admin_users a
        WHERE a.auth_user_id = auth.uid() AND a.is_active = TRUE
    )
);

-- Sanity check: the insert/update/delete policies an admin session must never
-- have are absent. (Expect one row per policy name below.)
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'orders' ORDER BY cmd;