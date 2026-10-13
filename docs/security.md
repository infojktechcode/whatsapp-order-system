# Security — WhatsApp Order System

## OWASP (§24)
- SQL injection, XSS, CSRF, IDOR, broken access control, privilege escalation,
  insecure direct object references, webhook spoofing, replay attacks,
  duplicate payments, price/quantity/inventory manipulation, mass assignment.

## Payment Security (§10-11)
- Never expose CONSUMER_KEY, CONSUMER_SECRET, PASSKEY to the frontend.
- Callbacks treated as untrusted input.
- Validate: Order ID, Merchant request ID, Checkout request ID, Amount,
  Receipt number, Transaction date, Phone number.
- Idempotency, duplicate callback protection, transaction reference,
  amount verification, order verification, phone-number verification.
- Database transactions where possible.

## RLS (§15)
- Customers: own profile, addresses, orders, order items, payments only.
- Public: active products, active variants, active scents, public images, pricing tiers.
- Admins: SELECT on orders only — see "Admin access" below.
- NEVER use USING (true) on sensitive tables.
- Service-level access via backend/service role, not weakened RLS.

## Abuse resistance
- `/functions/v1/checkout` is public (the publishable key ships in the browser),
  so it is rate limited in Postgres — see docs/deployment.md for the knobs.
- Attempts that create no order consume no quota, so honest mistakes are never
  punished, and the limiter fails open if the counter itself errors.
- Stock is reserved per order (`stock_reservations`), so repeated checkout calls
  cannot oversell a variant even though checkout is unauthenticated.

## Admin access
- Staff sign in with Supabase Auth (email + password). The browser never handles a
  token itself: `functions.invoke` attaches the session JWT automatically.
- Two gates, both required, on every `POST /functions/v1/admin` call:
  1. the platform verifies the JWT (`verify_jwt` stays on), and
  2. the function resolves the caller with Auth and requires an **active**
     `admin_users` row. The publishable key is a valid project credential that even
     passes the platform check, so this second gate is the one that matters —
     anon, publishable-key and plain customer sessions all get 401/403.
- Orders are read-only for every client role (`0003_admin_orders_readonly.sql`):
  totals come only from `create_order()`, and status only from
  `transition_order_status()`, which enforces the matrix and writes
  `order_status_history`. There is no INSERT/UPDATE/DELETE policy on orders.
- An admin can never mark an order `paid` — only a validated Daraja callback may.
- Roles: `viewer` read-only; `admin`/`manager`/`super_admin` may transition.
- Every admin transition is written to `audit_logs` with the actor, the previous
  and new status, and the optional reason.

## Secrets (§28)
- No secrets in source code.
- Use environment/secrets storage (Supabase Vault).
