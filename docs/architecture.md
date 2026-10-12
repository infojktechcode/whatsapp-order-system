# Architecture — WhatsApp Order System

## Stack
- Frontend: React + TypeScript + Vite (mobile-first)
- Backend API: Supabase (PostgreSQL, Auth, Storage)
- Serverless: Supabase Edge Functions (Deno)
- Payments: Safaricom M-Pesa Daraja
- Messaging: WhatsApp Cloud API
- Hosting: Vercel (frontend), Supabase (backend)

## Layered Architecture
`
WhatsApp / Web UI
    -> Webhook / Message Parser / Conversation State
    -> Product Service
    -> Cart Service
    -> Checkout Service
    -> Payment Service
    -> PostgreSQL (Supabase)
    -> M-Pesa Daraja
    -> WhatsApp Cloud API
`

## Hard Rules
- Prices come from the database only; never from the frontend.
- Backend recalculates totals at checkout.
- Only a validated Daraja callback marks payment PAID.
- RLS enforced from day one; no USING (true) on sensitive tables.
- Secrets live in Supabase Vault / environment variables; never in source code.
- WhatsApp reuses the same backend services as the website — no separate ordering system.
