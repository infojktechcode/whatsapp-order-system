// The status capability token is the only thing standing between a guest
// order and unauthenticated status disclosure: the browser has no RLS read
// access, so order-status must accept nothing but a valid HMAC.

import { describe, it, expect } from 'vitest'
import {
  mintStatusToken,
  verifyStatusToken,
} from '../../supabase/functions/_shared/statusToken.js'

const SECRET = 'test-secret-do-not-use-in-production'
const ORDER_ID = '10000001-0000-0000-0000-000000000009'

describe('order status capability token', () => {
  it('mints a 64-char lowercase hex HMAC (SHA-256)', async () => {
    const token = await mintStatusToken(ORDER_ID, SECRET)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('verifies its own token', async () => {
    const token = await mintStatusToken(ORDER_ID, SECRET)
    expect(await verifyStatusToken(ORDER_ID, token, SECRET)).toBe(true)
  })

  it('is deterministic for the same order — polling can re-mint or re-verify', async () => {
    const a = await mintStatusToken(ORDER_ID, SECRET)
    const b = await mintStatusToken(ORDER_ID, SECRET)
    expect(a).toBe(b)
  })

  it('rejects a token minted for a different order id', async () => {
    const token = await mintStatusToken(ORDER_ID, SECRET)
    const otherOrder = '10000001-0000-0000-0000-000000000008'
    expect(await verifyStatusToken(otherOrder, token, SECRET)).toBe(false)
  })

  it('rejects a token minted with a different secret', async () => {
    const token = await mintStatusToken(ORDER_ID, 'another-secret')
    expect(await verifyStatusToken(ORDER_ID, token, SECRET)).toBe(false)
  })

  it('rejects a single-character tamper', async () => {
    const token = await mintStatusToken(ORDER_ID, SECRET)
    const flipped = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
    expect(await verifyStatusToken(ORDER_ID, flipped, SECRET)).toBe(false)
  })

  it('fails closed on malformed values', async () => {
    for (const bad of [
      undefined,
      null,
      42,
      '',
      'not-hex',
      'A'.repeat(64), // uppercase
      'a'.repeat(63), // short
      'a'.repeat(65), // long
      { toString: () => 'a'.repeat(64) }, // object, not string
    ]) {
      expect(await verifyStatusToken(ORDER_ID, bad, SECRET)).toBe(false)
    }
  })

  it('does not accept another order id that shares a token prefix', async () => {
    // GUID-lookalike ids must not open each other's status.
    const token = await mintStatusToken(ORDER_ID, SECRET)
    const near = ORDER_ID.replace(/9$/, '1')
    expect(await verifyStatusToken(near, token, SECRET)).toBe(false)
  })
})
