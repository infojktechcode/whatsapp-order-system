// The WhatsApp conversation state machine lives server-side now:
//
//   supabase/functions/whatsapp/state.ts   (pure machine — unit tested in Vitest)
//   supabase/functions/whatsapp/index.ts   (Cloud API webhook: signature check,
//                                           persistence, Graph API replies)
//
// The browser must not drive conversations: Meta's server calls the webhook
// directly (deployed with --no-verify-jwt), and all ordering inside the chat
// goes through the same checkout / mpesa-stk Edge Functions as the website so
// prices are always recomputed by create_order() in Postgres.
//
// Nothing in the web app should import this module.

export {}
