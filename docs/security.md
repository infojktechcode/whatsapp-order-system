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
- Admins: full CRUD on products, variants, orders.
- NEVER use USING (true) on sensitive tables.
- Service-level access via backend/service role, not weakened RLS.

## Secrets (§28)
- No secrets in source code.
- Use environment/secrets storage (Supabase Vault).
