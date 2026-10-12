// Service-role database access. This module must only ever be imported from
// inside supabase/functions/* — the service-role key bypasses RLS and is never
// present in the browser bundle.

import { createClient } from "npm:@supabase/supabase-js@2"
import type { SupabaseClient } from "npm:@supabase/supabase-js@2"

let cached: SupabaseClient | null = null

export function admin(): SupabaseClient {
  if (cached) return cached
  const url = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured")
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

export function projectUrl(): string {
  const url = Deno.env.get("SUPABASE_URL")
  if (!url) throw new Error("SUPABASE_URL is not configured")
  return url
}

/**
 * Database errors from create_order()/mpesa_handle_result() carry business
 * messages ("Insufficient stock for SKU ..."). Only those known-safe messages
 * may reach the client; everything else becomes a generic error.
 */
const SAFE_DB_PATTERNS =
  /stock|delivery rate|minimum order|county|phone|quantity|variant|product|customer type|method|pickup|items must/i

export function safeDbMessage(message: string | undefined | null): string | null {
  if (!message) return null
  const raise = message.match(/P0001:\s*(.+)$/s)
  const text = (raise ? raise[1] : message).trim()
  return SAFE_DB_PATTERNS.test(text) ? text.replace(/\n/g, " ").slice(0, 200) : null
}
