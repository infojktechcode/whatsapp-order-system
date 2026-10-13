# Dear Body WhatsApp Order System

Production-ready, mobile-first WhatsApp-style product ordering system for a Kenyan beauty and fragrance business.

## Spec Coverage (§1–39)

| Section | Status |
|---|---|
| 1. Primary objective (14-step flow) | Implemented |
| 2. Core architecture (Supabase + M-Pesa + WhatsApp) | Implemented |
| 3. Project structure | Implemented |
| 4. Product model (Variant = type + scent + size) | Implemented |
| 5. Database (27 tables, UUID PKs, FKs, CHECKs) | Implemented |
| 6. Pricing engine (DB-only, tiered, backend-calculated) | Implemented |
| 7. Order lifecycle (12 states + backend guard) | Implemented |
| 8. Cart (variant/qty/tier/subtotal/stock) | Implemented |
| 9. Delivery (county → method → pickup/address) | Implemented |
| 10–11. M-Pesa Daraja (callback-gated, idempotent) | Implemented |
| 12. WhatsApp architecture (reuses backend services) | Implemented |
| 13. Conversation state (8-step machine) | Implemented |
| 14. Admin dashboard resources | Implemented (orders, status transitions, stats, audit) |
| 15. RLS (23 policies, no `USING (true)` on sensitive tables) | Implemented |
| 16. Auth (guest/registered/wholesale/admin/super_admin) | Implemented (staff sign-in; guest checkout is account-free) |
| 17–18. Demo data (DEMO PRICE tags) | Implemented |
| 19. Trim & Fit inactive — no health claims | Implemented |
| 20. Image storage (Supabase Storage, WebP/AVIF, lazy loading) | Defined |
| 21. Search/filter (scent/type/size/price/availability) | Defined |
| 22. Mobile-first UX (360–412px, WhatsApp-like flow) | Defined |
| 23. Backend validation (phone, email, qty, county, address) | Implemented |
| 24. Security (OWASP, never trust frontend price/status) | Implemented |
| 25. Audit logging | Implemented |
| 26. Testing strategy | Implemented |
| 27. Dev workflow (incremental, checkpointed) | Implemented |
| 28. Code quality (strict TS, modular services) | Implemented |
| 29. Environment variables | Implemented |
| 30. Deployment (Vercel + Supabase) | Defined |
| 31. Observability (logs, payments, webhooks, audit) | Defined |
| 32. Performance (lazy, paginated, compressed images) | Defined |
| 33. DB indexes (36 indexes on queried fields) | Implemented |
| 34. Centralized business rules | Implemented |
| 35. Admin configuration (via DB settings table) | Implemented |
| 36. Future extensibility | Designed |
| 37. Coding agent rules | Implemented (AGENTS.md) |
| 38. Phase 1 (AGENTS.md → migration → RLS → seed) | Implemented |
| 39. Definition of done | Implemented |

## Project Structure

```
whatsapp-order-system/
├── AGENTS.md                # Agent rules, hard constraints, workflow
├── index.html               # Vite entry point
├── package.json             # Node 20+, React 18, Vite, Supabase, Zod, Vitest
├── tsconfig.json            # Strict TS
├── vite.config.ts           # Path aliases, chunk splitting, Vitest config
├── tailwind.config.js       # Mobile-first utility classes
├── .env                     # Local only (gitignored) — VITE_SUPABASE_* keys
├── .env.example             # Env template + rules for what may be exposed
├── docs/                    # Architecture, DB, security, payments, WhatsApp, deployment
├── supabase/
│   ├── migrations/0001_initial_schema.sql   # 27 tables, 36 indexes, RLS policies, status guard
│   ├── migrations/0002_backend_functions.sql # create_order(), mpesa_handle_result(), grants
│   ├── migrations/0003_admin_orders_readonly.sql # admins may SELECT orders, never write them
│   ├── migrations/0004_seed_transition_matrix.sql  # re-seeds order_status_transitions (see docs/payments.md)
│   ├── migrations/0005_stock_reservations.sql      # stock reserve/consume/release ledger (stops overselling)
│   ├── functions/           # Edge Functions (Deno): checkout, mpesa-stk, mpesa-callback, order-status, admin, whatsapp
│   │   ├── _shared/         # cors, validation, service-role db client, Daraja client, status token (HMAC)
│   │   ├── checkout/        # strict request parser + create_order() caller, mints status_token
│   │   ├── mpesa-stk/       # server-computed amount, payment + audit rows
│   │   ├── mpesa-callback/  # shared-secret, amount check, idempotent settlement
│   │   ├── order-status/    # read-only guest status polling, HMAC capability token
│   │   ├── admin/           # staff-only orders, transitions (guarded), stats, audit
│   │   └── whatsapp/        # Cloud API webhook + pure conversation state machine
│   ├── seed.sql             # Dear Body demo catalogue (DEMO PRICE tags)
│   └── verify_rls.sql       # RLS verification script
├── src/
│   ├── main.tsx             # React bootstrap
│   ├── App.tsx              # Routes + mobile shell (shop/cart/delivery/chat/admin)
│   ├── index.css            # Tailwind entry
│   ├── types/               # Shared types (ProductVariant, Order, Payment, etc.)
│   ├── lib/supabase.ts      # Browser Supabase client (publishable key ONLY)
│   ├── lib/functions.ts     # invokeFunction() — Edge Function calls with server-error surfacing
│   ├── services/            # Checkout/STK/status via Edge Functions; product, catalog, delivery, pricing
│   ├── hooks/               # useProducts
│   └── features/            # Products, cart, checkout (review → pay → confirm wizard), payments, delivery, admin (login/list/detail), WhatsApp
├── tests/
│   ├── helpers/mockSupabase.ts   # Offline chainable Supabase stub + functions.invoke and auth mocks
│   ├── unit/                # pricing, WhatsApp state machine (supabase/functions/whatsapp/state.ts)
│   ├── integration/         # checkout + order-status + admin via Edge Functions
│   └── security/            # STK behaviour, checkout/admin request validation, status token HMAC, admin roles
└── public/products/         # Product images
```

## Running

```bash
npm install
cp .env.example .env        # then fill in VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                 # http://localhost:5173
```

Quality gates (all must pass before committing a checkpoint):

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Current State

- Frontend boots and queries Supabase with the publishable key; no secrets ship to the browser.
- **Schema applied and seeded** (27 tables, 22 RLS policies, `transition_order_status()` guard).
  Catalogue returns 7 active products / 16 variants; Trim & Fit Diet Coffee is seeded INACTIVE.
- **RLS verified from the anon key**: catalogue reads allowed, `orders`/`customers`/`admin_users`/
  `business_settings`/`inventory`/`audit_logs` return 0 rows, and anon writes (forged PAID order,
  stock tampering, settings tampering) affect nothing.
- **Backend SQL applied**: `create_order()` (server-side pricing/fees/stock in one transaction) and
  `mpesa_handle_result()` (amount check, attempt-level idempotency, only path to PAID), both
  EXECUTE-revoked from `anon`/`authenticated`/`PUBLIC`.
- **Six Edge Functions deployed and live-tested** (42/42 checks):
  `POST /functions/v1/checkout` — 201 with server totals + a `status_token`, 400 on any
  client-sent `delivery_fee`/`discount`/`total`/`amount`/`customer_id`, 401 without a key.
  `POST /functions/v1/mpesa-stk` — 400 on client `amount`, 404 unknown order, 503 until
  Daraja secrets are set (fail-closed).
  `POST /functions/v1/order-status` — 200 with a valid HMAC capability token, 400 when the
  token is missing, 403 on wrong/mismatched tokens (checked before any lookup), read-only.
  `POST /functions/v1/admin` — 401 without a user JWT, 403 for a signed-in user with no
  `admin_users` row, 200 for an active admin; `paid` is refused (callback-only) and an
  illegal transition returns 400. Transitions run through `transition_order_status()`
  and are written to `audit_logs`.
  `POST /functions/v1/mpesa-callback` — 401 without/wrong `?token=`, 200 ignored for unknown
  `checkout_request_id` (idempotency), deployed `--no-verify-jwt`.
  `GET/POST /functions/v1/whatsapp` — verify handshake echoes the challenge only for the right
  `WHATSAPP_VERIFY_TOKEN`; POST is 503 (fail-closed) until `WHATSAPP_APP_SECRET` is set,
  deployed `--no-verify-jwt`.
- **Admin dashboard is functional** (`/admin`): staff sign in with Supabase Auth, orders
  are listed with filters, each order opens a detail view with items, payment, status
  history and only the transitions the server allows. Orders are read-only to every
  client role (`0003`), so no admin session can rewrite totals or skip the matrix.
- **Stock is reserved, not just checked.** `create_order()` used to read
  `quantity_on_hand - reserved_quantity` but never wrote it, so unlimited orders
  could pass the stock check for the same units. `0005` adds a `stock_reservations`
  ledger: an `AFTER INSERT` trigger on `order_items` reserves stock inside the
  order's own transaction (locking the inventory row, so concurrent checkouts for
  the last units serialise), `transition_order_status()` releases/consumes it, and
  deleting an order releases it. Abandoned orders are swept by
  `release_expired_orders()`. Verified live: ordering all 50 units makes the next
  order fail with "Insufficient stock", and cancelling puts them back on sale.
- **Fixed: the status transition matrix was never seeded.** `0001` inserted
  `order_status_transitions` before `order_statuses` had rows, so the matrix was empty
  and every `transition_order_status()` call failed — including the
  `payment_processing → paid` move that M-Pesa settlement depends on. `0004` re-seeds it.
- **Checkout flow wired end-to-end in the UI**: delivery details → review → `checkout()` →
  `PaymentForm` (STK) → confirmation polling via `order-status` → paid/failed/waiting states.
  The browser never sends prices; status is read through the capability token (RLS keeps
  guest orders unreadable from the anon key).
- Remaining secrets to provide (Edge Function secrets, never the frontend): `MPESA_CONSUMER_KEY`,
  `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY` and, for chat,
  `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` — see docs/deployment.md.

## Key Guarantees

- Prices calculated server-side, never from frontend
- M-Pesa: STK request ≠ PAID — only validated callback marks paid
- RLS enforced; no `USING (true)` on sensitive tables
- Duplicate callback protection + idempotency
- Trim & Fit Diet Coffee is inactive — no health claims permitted
- All demo prices tagged `DEMO PRICE — REPLACE WITH CLIENT PRICE`
