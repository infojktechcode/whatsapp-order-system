// Order-status capability token.
//
// Guest checkout has no auth session, and RLS only lets `auth.uid()` owners read
// orders/payments — so the browser polls status through the `order-status` Edge
// Function instead of the tables. `checkout` mints this HMAC over the order id;
// `order-status` verifies it before returning anything. Knowing the order UUID
// alone is not enough (e.g. an order number shared in WhatsApp leaks the id but
// not the token).
//
// Pure Web Crypto: runs in Deno and under Vitest (Node >= 18) unchanged.

import { timingSafeEqual } from "./validate.ts"

const TOKEN_RE = /^[0-9a-f]{64}$/

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
}

/** hex(HMAC-SHA256(secret, order_id)) — the browser's read capability. */
export async function mintStatusToken(orderId: string, secret: string): Promise<string> {
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(orderId))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** Constant-time verification; anything malformed fails closed. */
export async function verifyStatusToken(
  orderId: string,
  token: unknown,
  secret: string,
): Promise<boolean> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return false
  const expected = await mintStatusToken(orderId, secret)
  return timingSafeEqual(expected, token)
}
