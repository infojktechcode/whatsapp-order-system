# Deployment — WhatsApp Order System

## Targets

- Frontend: Vercel
- Backend: Supabase (Postgres + RLS + Edge Functions)
- Storage: Supabase Storage
- Payments: Safaricom Daraja (Edge Function secrets only)
- Messaging: WhatsApp Cloud API (Edge Function secrets only)
- Domain: Client-owned production domain

## Quality gates (run before every checkpoint)

```bash
npm run typecheck
npm run lint
npm run test      # Vitest: unit + integration + security (offline)
npm run build
```

## Database

Migrations run through the Supabase SQL editor or the Management API:

```bash
node <helper>/run-sql.cjs <project-ref> <management-token> supabase/migrations/0001_initial_schema.sql
node <helper>/run-sql.cjs <project-ref> <management-token> supabase/migrations/0002_backend_functions.sql
node <helper>/run-sql.cjs <project-ref> <management-token> supabase/migrations/0003_admin_orders_readonly.sql
node <helper>/run-sql.cjs <project-ref> <management-token> supabase/migrations/0004_seed_transition_matrix.sql
node <helper>/run-sql.cjs <project-ref> <management-token> supabase/migrations/0005_stock_reservations.sql
node <helper>/run-sql.cjs <project-ref> <management-token> supabase/migrations/0006_checkout_rate_limit.sql
```

- `0001` — 27 tables, indexes, RLS policies, `transition_order_status()`.
- `0002` — `set_order_number()`, `create_order()`, `mpesa_handle_result()`, and the
  EXECUTE grants that stop `anon`/`authenticated` from calling privileged functions.
- `0003` — admins get SELECT on orders only; no client role can write orders.
- `0004` — re-seeds `order_status_transitions` (run after the seed data, see payments.md).
- `0005` — `stock_reservations` ledger + reserve/consume/release triggers and the
  expiry sweep. Idempotent; safe to re-run.
- `0006` — checkout rate limiting (`checkout_attempts` + service-role-only RPCs).
- `supabase/seed.sql` must run **after** the migrations.

## Edge Functions

```bash
supabase functions deploy checkout mpesa-stk order-status admin \
  --project-ref <ref> --use-api

supabase functions deploy mpesa-callback whatsapp \
  --project-ref <ref> --use-api --no-verify-jwt
```

- `checkout` / `mpesa-stk` / `order-status` / `admin` keep JWT verification **on** —
  verified live that the browser's publishable key (`sb_publishable_…`) is accepted.
- `mpesa-callback` / `whatsapp` must be reachable by Safaricom/Meta without a JWT.
- `admin` additionally resolves the caller against `admin_users` inside the handler;
  the platform check alone would accept the publishable key.

### Secrets

```bash
supabase secrets set KEY=value --project-ref <ref>
```

| Secret | Set by | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | platform | auto-injected |
| `MPESA_CALLBACK_TOKEN` | us | ✅ set — shared secret in the callback URL |
| `ORDER_STATUS_SECRET` | us | ✅ set — HMAC key for guest status polling tokens |
| `WHATSAPP_VERIFY_TOKEN` | us | ✅ set — Meta webhook verification token |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET` | client | required for live STK |
| `MPESA_SHORTCODE`, `MPESA_PASSKEY` | client | required for live STK |
| `MPESA_BASE_URL` | us | sandbox default; switch for production |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | client | Graph API send |
| `WHATSAPP_APP_SECRET` | client | webhook signature (fail-closed until set) |

Never place these in `.env`, `VITE_*` variables, or the repo — they exist only as
Edge Function secrets (dashboard → Settings → Edge Functions, or `supabase secrets set`).

### Callback URL

Constructed automatically as
`https://<ref>.supabase.co/functions/v1/mpesa-callback?token=<MPESA_CALLBACK_TOKEN>`
unless `MPESA_CALLBACK_URL` overrides it. The token is never echoed to any client.

## Live smoke test

```bash
node <helper>/fnsmoke.mjs   # 42 checks against the deployed functions
```

Covers: auth gate, server-side totals, price-field rejection, STK allowlist/status/config
guards, callback shared-secret gate + idempotent unknown-id handling, WhatsApp verify
handshake and signature fail-closed behaviour, the order-status capability-token
gates (400 missing / 403 wrong token / 403 order-token mismatch / 200 valid), and the
admin gates (401 no JWT / 403 signed-in non-admin / 200 active admin, `paid` refused,
illegal transition refused).
Cleans up its test orders afterwards.

## Rate limiting

Checkout is reachable by anyone holding the publishable key (it ships in the
browser bundle), so it is rate limited in two independent layers:

1. **Application (migration 0006)** — `check_checkout_rate_limit()` runs before
   `create_order()` and refuses with `429` + `Retry-After`. The counter lives in
   Postgres (`checkout_attempts`) because Edge Function instances share no
   memory, so an in-process limit would reset on every cold start. Only attempts
   that actually created an order are recorded, so a customer who mistypes their
   delivery details is never locked out.

   Tune without a redeploy — `business_settings`:

   | Key | Default | Notes |
   |---|---|---|
   | `checkout_rate_limit_per_phone_per_hour` | 5 | `0` disables the phone limit |
   | `checkout_rate_limit_per_ip_per_hour` | 20 | **Raise it** if customers share a NAT/mobile IP — Kenyan carriers put many subscribers behind one public address, and a low cap would block legitimate orders |

   If the counter errors, checkout **fails open** on purpose: a broken limiter
   must never stop customers from ordering.

2. **Platform (Supabase)** — set per-function rate limits in
   **Edge Functions → checkout → Rate limits** in the dashboard. This caps
   function invocations (CPU/abuse) independently of the business rule above.

## Admin accounts

The dashboard (`/admin`) signs staff in with Supabase Auth. A signed-in user needs an
`admin_users` row to do anything — Auth alone is not enough.

```sql
INSERT INTO admin_users (auth_user_id, name, email, role, is_active)
VALUES ('<auth.users.id>', 'Staff Name', 'staff@example.com', 'admin', true);
```

Create the login first in **Authentication → Users**, then copy its UUID here.
Roles: `super_admin`, `admin`, `manager` (may change order status) and `viewer`
(read-only).

Two throwaway accounts exist for the live smoke test:
`admin@dearbody.test` (super_admin, has an `admin_users` row) and
`staff@dearbody.test` (signed in but **not** an admin — the 403 case).
Their passwords live in the smoke script, not in this repo. Delete both and use
real staff accounts before this goes live.

## Repository hygiene

- `.env` is gitignored; only `.env.example` is committed.
- The Supabase **Management API token** and **database password** are credentials:
  rotate them after any session that used them (dashboard → Account → Tokens /
  Project Settings → Database).
