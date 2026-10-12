import { createClient } from "@supabase/supabase-js"

// Read from .env via Vite. Only publishable keys may appear here — this module
// is bundled into the browser. Server secrets (M-Pesa passkey, service-role
// key, WhatsApp token) live exclusively in Supabase Edge Function secrets.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase env variables. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY."
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// NOTE: there is intentionally no `createSupabaseAdmin()` here. The
// service-role key bypasses RLS and must never be importable from `src/`.
// Privileged writes happen in `supabase/functions/*` (Edge Functions).
