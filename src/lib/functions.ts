// Thin wrapper around supabase.functions.invoke() so every Edge Function call
// fails the same way: an Error whose message is the server's `{ error }` text
// (which the Edge Functions keep user-safe), falling back to a generic one.
//
// The browser only ever sends business input (ids, quantities, phone numbers).
// Prices, fees, totals and payment state come back from the server.

import { supabase } from './supabase.js'

/** Best-effort extraction of `{ error: string }` from a failed invoke. */
async function serverMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response } | null | undefined)?.context
  if (!context || typeof context.json !== 'function') return null
  try {
    const body = (await context.json()) as { error?: unknown; message?: unknown }
    if (typeof body?.error === 'string' && body.error) return body.error
    if (typeof body?.message === 'string' && body.message) return body.message
    return null
  } catch {
    // Body already consumed (or not JSON) — fall back to the generic message.
    return null
  }
}

/**
 * Invokes an Edge Function and returns its JSON payload.
 * Throws an Error carrying the server's message when the call fails.
 */
export async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  let response: { data: unknown; error: unknown }
  try {
    response = await supabase.functions.invoke(name, { body: body as Record<string, unknown> })
  } catch (e) {
    const fallback = e instanceof Error && e.message ? e.message : `${name} failed`
    throw new Error((await serverMessage(e)) ?? fallback)
  }

  if (response.error) {
    throw new Error((await serverMessage(response.error)) ?? `${name} failed`)
  }
  if (response.data === null || response.data === undefined) {
    throw new Error(`${name} returned an unexpected response`)
  }
  return response.data as T
}
