# AGENTS.md — WhatsApp Order System

Engineering standard: **Production-Ready · Secure · Tested · Maintainable · Scalable**

This file is the entry point for all coding work in this repository. It defines the
architecture, the hard rules, and the required workflow. Always read this file before
starting work on the codebase.

---

## 1. Project Purpose

A production-ready, mobile-first WhatsApp-style product ordering system for a Kenyan
business selling **Dear Body** beauty and fragrance products.

Customers can browse products, search/filter, select scent + product type + size, view
retail and wholesale pricing, build an order, enter delivery information, select a county
and delivery method, review the order, pay via M-Pesa, receive a confirmation, and track
order status.

Target customers: retail, wholesale, resellers, salons, beauty shops, perfume businesses,
bulk buyers.

---

## 2. Stack

| Layer          | Technology                              |
| -------------- | --------------------------------------- |
| Frontend       | React + TypeScript + Vite (mobile-first)|
| Backend API    | Supabase (PostgreSQL, Auth, Storage)    |
| Serverless     | Supabase Edge Functions (Deno)          |
| Database       | PostgreSQL with Row Level Security      |
| Payments       | Safaricom M-Pesa Daraja API             |
| Messaging      | WhatsApp Cloud API                      |
| Hosting        | Vercel (frontend), Supabase (backend)   |

---

## 3. Hard Rules (NEVER / ALWAYS)

### NEVER

- Never hard-code prices inside React components. Prices come from the database only.
- Never trust a price, subtotal, delivery fee, total, or payment status sent by the frontend.
  Recalculate everything server-side at checkout.
- Never mark an order as PAID merely because an STK Push request succeeded. Only a validated
  Daraja callback may flip payment status.
- Never expose `CONSUMER_KEY`, `CONSUMER_SECRET`, or `PASSKEY` to the frontend.
- Never use `USING (true)` on sensitive tables to make development easier.
- Never allow arbitrary frontend status changes. Status transitions are backend-controlled.
- Never hard-code all Kenyan counties into frontend logic.
- Never invent product information or real prices.
- Never make health or weight-loss claims for `Trim & Fit Diet Coffee`. Keep it inactive
  until verified client data is provided.
- Never bypass RLS, duplicate business logic, or rewrite stable functionality unnecessarily.
- Never install packages without justification.
- Never log M-Pesa PINs, passwords, API secrets, or full authentication tokens.

### ALWAYS

- Always inspect the existing code first and understand the architecture before changing it.
- Always perform validation on the backend, not just the client.
- Always use database transactions where possible.
- Always use UUID primary keys and `created_at` / `updated_at` timestamps.
- Always centralize business rules (wholesale thresholds, delivery fees, order expiry,
  low-stock thresholds) rather than scattering them through the code.
- Always implement RLS from the beginning.
- Always log important admin actions to `audit_logs`.
- Always test before declaring a feature complete (unit, integration, security, e2e).
- Always run type checking, lint, and tests after every major stage.

---

## 4. Product Data Model

Do **NOT** model the catalogue as `Product → Shade`. Use:

```
Product
  └── Product Variant (product type + scent + size)
```

Each variant has its own SKU, product type, scent, size, retail price, wholesale price,
wholesale threshold, stock quantity, active flag, product image, description, barcode,
and metadata.

---

## 5. Order Lifecycle

```
DRAFT → PENDING_CHECKOUT → AWAITING_PAYMENT → PAYMENT_PROCESSING
→ PAID → CONFIRMED → PROCESSING → READY_FOR_DISPATCH → DISPATCHED → DELIVERED
```

Failure states: `PAYMENT_FAILED`, `CANCELLED`, `REFUNDED`.

---

## 6. Required Workflow

Work incrementally. Do NOT generate the entire application in one uncontrolled operation.

```
PLAN → ARCHITECTURE → DATABASE → RLS → SEED DATA → BACKEND SERVICES
→ PRODUCT UI → CART → CHECKOUT → DELIVERY → PAYMENTS → ADMIN
→ WHATSAPP → TESTING → SECURITY AUDIT → DEPLOYMENT
```

After every major stage:

1. Implement
2. Run type checking
3. Run lint
4. Run tests
5. Fix failures
6. Review security
7. Verify functionality
8. Commit checkpoint

Never continue while known critical errors remain.

---

## 7. Code Quality

- TypeScript strict mode
- Reusable components, modular services, small functions, clear naming
- No duplicated business logic, no unnecessary abstractions, no giant components
- No hard-coded business rules, no secrets in source code
- Prefer `services/`, `features/`, `repositories/`, `validators/`, `types/` where useful

---

## 8. Demo Data

All initial prices are placeholders. Every demo price must be clearly documented as:

```
DEMO PRICE — REPLACE WITH CLIENT PRICE
```

Put demo pricing in seed/configuration data rather than scattered throughout the codebase.

Where a photograph does not provide enough information, use `Unknown / To Be Confirmed`
rather than hallucinating data.
