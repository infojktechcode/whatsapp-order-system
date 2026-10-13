-- ============================================================
-- 0006 — Checkout rate limiting
-- ============================================================
--
-- GAP: /functions/v1/checkout is callable by anyone holding the publishable key,
-- which ships in the browser bundle. Nothing throttled it, so orders and customer
-- rows could be created without limit (DB bloat, a flooded admin dashboard, a
-- polluted audit trail).
--
-- WHY A TABLE AND NOT MEMORY: Edge Functions run across many instances with no
-- shared state, so an in-process counter resets on every cold start. The counter
-- lives in Postgres where every instance sees the same numbers.
--
-- Limits come from business_settings so they can be tuned without a code deploy:
--   checkout_rate_limit_per_phone_per_hour  (default 5)
--   checkout_rate_limit_per_ip_per_hour      (default 20)
--
-- Only attempts that produced an ORDER are recorded (record_checkout_attempt is
-- called after create_order succeeds). A customer who mistypes their delivery
-- method should not be locked out for an hour, and a request that never created
-- anything causes no bloat to defend against.

CREATE TABLE IF NOT EXISTS checkout_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT,
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_attempts_created ON checkout_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_checkout_attempts_phone ON checkout_attempts(phone, created_at);
CREATE INDEX IF NOT EXISTS idx_checkout_attempts_ip ON checkout_attempts(ip, created_at);

-- No policies: clients can neither read nor write it. Service role only.
ALTER TABLE checkout_attempts ENABLE ROW LEVEL SECURITY;

-- Visible settings so an operator can find and tune them.
INSERT INTO business_settings (key, value, description)
VALUES
  ('checkout_rate_limit_per_phone_per_hour',
   '{"value": 5}'::jsonb,
   'Checkout attempts allowed per phone number per hour. Set 0 to disable the phone limit.'),
  ('checkout_rate_limit_per_ip_per_hour',
   '{"value": 20}'::jsonb,
   'Checkout attempts allowed per client IP per hour. Raise it if many customers share one NAT address.')
ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = NOW();

-- ============================================================
-- check_checkout_rate_limit — called BEFORE create_order
-- ============================================================
-- Returns {"allowed": true} or {"allowed": false, "scope": ..., "retry_after_minutes": N}.
CREATE OR REPLACE FUNCTION check_checkout_rate_limit(p_phone TEXT, p_ip TEXT)
RETURNS JSONB AS $$
DECLARE
    v_phone_limit INTEGER;
    v_ip_limit INTEGER;
    v_count INTEGER;
    v_oldest TIMESTAMPTZ;
    v_retry INTEGER;
    v_since TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
BEGIN
    SELECT COALESCE((value->>'value')::INTEGER, 5) INTO v_phone_limit
      FROM business_settings WHERE key = 'checkout_rate_limit_per_phone_per_hour';
    IF v_phone_limit IS NULL THEN v_phone_limit := 5; END IF;

    SELECT COALESCE((value->>'value')::INTEGER, 20) INTO v_ip_limit
      FROM business_settings WHERE key = 'checkout_rate_limit_per_ip_per_hour';
    IF v_ip_limit IS NULL THEN v_ip_limit := 20; END IF;

    -- Keep only the window we need (index-backed range delete, a few rows).
    DELETE FROM checkout_attempts WHERE created_at < NOW() - INTERVAL '2 hours';

    IF p_phone IS NOT NULL AND v_phone_limit > 0 THEN
        SELECT count(*), min(created_at) INTO v_count, v_oldest
          FROM checkout_attempts
         WHERE phone = p_phone AND created_at >= v_since;

        IF v_count >= v_phone_limit THEN
            v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest + INTERVAL '1 hour' - NOW())) / 60.0)::INTEGER);
            RETURN jsonb_build_object('allowed', FALSE, 'scope', 'phone',
                                      'retry_after_minutes', v_retry);
        END IF;
    END IF;

    IF p_ip IS NOT NULL AND v_ip_limit > 0 THEN
        SELECT count(*), min(created_at) INTO v_count, v_oldest
          FROM checkout_attempts
         WHERE ip = p_ip AND created_at >= v_since;

        IF v_count >= v_ip_limit THEN
            v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest + INTERVAL '1 hour' - NOW())) / 60.0)::INTEGER);
            RETURN jsonb_build_object('allowed', FALSE, 'scope', 'ip',
                                      'retry_after_minutes', v_retry);
        END IF;
    END IF;

    RETURN jsonb_build_object('allowed', TRUE);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- record_checkout_attempt — called AFTER create_order succeeded
-- ============================================================
CREATE OR REPLACE FUNCTION record_checkout_attempt(p_phone TEXT, p_ip TEXT)
RETURNS VOID AS $$
BEGIN
    INSERT INTO checkout_attempts (phone, ip) VALUES (p_phone, p_ip);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.check_checkout_rate_limit(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_checkout_rate_limit(TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_checkout_attempt(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_checkout_attempt(TEXT, TEXT) TO service_role;