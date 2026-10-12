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
```

- `0001` — 27 tables, indexes, RLS policies, `transition_order_status()`.
- `0002` — `set_order_number()`, `create_order()`, `mpesa_handle_result()`, and the
  EXECUTE grants that stop `anon`/`authenticated` from calling privileged functions.

## Edge Functions

```bash
supabase functions deploy checkout mpesa-stk \
  --project-ref <ref> --use-api

supabase functions deploy mpesa-callback whatsapp \
  --project-ref <ref> --use-api --no-verify-jwt
```

- `checkout` / `mpesa-stk` keep JWT verification **on** — verified live that the browser's
  publishable key (`sb_publishable_…`) is accepted.
- `mpesa-callback` / `whatsapp` must be reachable by Safaricom/Meta without a JWT.

### Secrets

```bash
supabase secrets set KEY=value --project-ref <ref>
```

| Secret | Set by | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | platform | auto-injected |
| `MPESA_CALLBACK_TOKEN` | us | ✅ set — shared secret in the callback URL |
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
node <helper>/fnsmoke.mjs   # 18 checks against the deployed functions
```

Covers: auth gate, server-side totals, price-field rejection, STK allowlist/status/config
guards, callback shared-secret gate + idempotent unknown-id handling, WhatsApp verify
handshake and signature fail-closed behaviour. Cleans up its test orders afterwards.

## Repository hygiene

- `.env` is gitignored; only `.env.example` is committed.
- The Supabase **Management API token** and **database password** are credentials:
  rotate them after any session that used them (dashboard → Account → Tokens /
  Project Settings → Database).
