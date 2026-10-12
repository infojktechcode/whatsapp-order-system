# Payments — WhatsApp Order System

## Flow (as implemented)

```
Browser/WhatsApp                    Edge Functions                    Postgres / Daraja
----------------                    --------------                    ----------------
checkout(input)      POST /checkout
  items + customer ───────────────> parseCheckout() allowlist
                                       (rejects any price field)
                                    create_order(JSONB...)  ────────> prices, wholesale tier,
                                                        <──────────── fee, discount, total
  <── order_number + totals ──────  (all amounts server-computed)

initiateStkPush      POST /mpesa-stk
  order_id + phone ───────────────> allowlist {order_id, phone}
                                    read orders.total (never the client)
                                    payments upsert (requested → processing)
                                    payment_transactions audit row
                                    Daraja STK push  ────────────────> POST /mpesa/stkpush
                                    transition → payment_processing
  <── status + amount (display) ──  NEVER marks anything PAID

                                    Safaricom POST /mpesa-callback?token=…
                                    1. shared secret (401 fail-closed, 503 if unset)
                                    2. structure check
                                    3. optional independent STK Query (MPESA_VERIFY_CALLBACK=1)
                                    4. mpesa_handle_result():
                                       - matches checkout_request_id (attempt-level)
                                       - amount vs orders.total → mismatch = payment_failed
                                       - idempotent: processed/settled attempts untouched
                                       - success → payments completed + order PAID (only path)
```

## Important Rules

- STK success = `PAYMENT_PROCESSING`, **not** PAID. Only a validated callback may mark PAID.
- The browser never sends an amount, fee, discount or total — `checkout` and `mpesa-stk`
  reject those fields with 400 (`_shared/validate.ts` → `FORBIDDEN_PRICE_FIELDS`).
- The browser never writes `payments`, `payment_transactions` or order status
  (`transition_order_status` has no EXECUTE for anon/authenticated).
- Idempotency is keyed per STK attempt (`payment_transactions` callback record for that
  `checkout_request_id`), so retries after a `payment_failed` settle correctly while
  settled statuses (`completed`/`cancelled`/`refunded`) are never re-processed.
- Every attempt (STK request, Daraja failure, callback) lands in `payment_transactions`.
- `MPESA_CALLBACK_TOKEN` is mandatory in both functions: without it `mpesa-stk` refuses to
  build a callback URL (503) and `mpesa-callback` rejects every request (503/401).

## Callback Validation Checklist

| Check | Where | On failure |
|---|---|---|
| Shared secret in `?token=` (constant-time) | `mpesa-callback/index.ts` | 401 (503 if secret unset) |
| `stkCallback.CheckoutRequestID` present | same | 400 |
| Optional independent Daraja STK Query | same (`MPESA_VERIFY_CALLBACK=1`) | treated as failure |
| Amount vs `orders.total` | `mpesa_handle_result()` | `payment_failed`, audit row |
| Duplicate/unknown callback | same | idempotent no-op / ignored |
| Phone + receipt recorded | same | payment + audit rows |

## Secrets (Edge Function secrets — never in the frontend)

| Secret | Purpose | State |
|---|---|---|
| `MPESA_CALLBACK_TOKEN` | Shared secret inside the callback URL | ✅ set (rotate if leaked) |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | Daraja OAuth | ⬜ pending client creds |
| `MPESA_SHORTCODE` / `MPESA_PASSKEY` | STK push signing | ⬜ pending client creds |
| `MPESA_BASE_URL` | Defaults to Daraja sandbox | ⬜ set to production when live |
| `MPESA_CALLBACK_URL` | Optional override; defaults to `…/mpesa-callback?token=…` | auto |
| `MPESA_VERIFY_CALLBACK` | `1` = independently confirm successes via STK Query | optional |

## Live-verified behaviour

- `checkout`: 201 (server totals), 400 (client-sent price fields), 400 (qty 0), 401 (no key).
- `mpesa-stk`: 400 (client `amount`), 404 (unknown order), 503 (Daraja secrets absent),
  409 (order not awaiting payment).
- `mpesa-callback`: 401 (missing/wrong token), 200 `received:false` (unknown checkout id).
