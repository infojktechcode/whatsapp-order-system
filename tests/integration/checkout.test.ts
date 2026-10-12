// Checkout is now a single Edge Function call: the browser sends ids and
// quantities only, and every number in CheckoutResult comes from the server.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  mockSupabase,
  resetMocks,
  mockInvoke,
  mockInvokeCalls,
  mockCalls,
} from '../helpers/mockSupabase.js'

vi.mock('../../src/lib/supabase.js', async () => ({ supabase: mockSupabase }))

import { checkout } from '../../src/services/checkout.service.js'
import type { CheckoutInput } from '../../src/types/checkout.js'

const SERVER_RESULT = {
  order_id: 'o1',
  order_number: 'DB-20261012-ABC123',
  subtotal: 16800,
  discount: 0,
  delivery_fee: 350,
  total: 17150,
  items: [
    {
      variant_id: 'v1',
      quantity: 24,
      unit_price: 700,
      pricing_tier: 'wholesale',
      line_total: 16800,
    },
  ],
}

const makeInput = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
  items: [{ variant_id: 'v1', quantity: 24 }],
  customer: { phone: '254712345678', name: 'Test Buyer' },
  customer_type: 'wholesale',
  delivery: {
    type: 'courier',
    county_id: '11000000-0000-0000-0000-000000000001',
    method_id: '22222222-2222-2222-2222-222222222202',
  },
  ...overrides,
})

describe('checkout via the Edge Function', () => {
  beforeEach(() => {
    resetMocks()
    mockInvoke('checkout', () => ({ data: SERVER_RESULT, error: null }))
  })

  it('maps the server totals onto CheckoutResult unchanged', async () => {
    const result = await checkout(makeInput())

    expect(result.order_number).toBe('DB-20261012-ABC123')
    expect(result.subtotal).toBe(16800)
    expect(result.delivery_fee).toBe(350)
    expect(result.total).toBe(17150)
    expect(result.pricing[0].pricing_tier).toBe('wholesale')
  })

  it('posts only business input — never prices, fees, discounts or totals', async () => {
    await checkout(makeInput())

    const calls = mockInvokeCalls('checkout')
    expect(calls).toHaveLength(1)

    const body = JSON.stringify(calls[0].body)
    for (const forbidden of [
      'delivery_fee',
      'discount',
      'subtotal',
      '"total"',
      'unit_price',
      'line_total',
      'pricing_tier',
      'customer_id',
    ]) {
      expect(body).not.toContain(forbidden)
    }

    const sent = calls[0].body as Partial<CheckoutInput>
    expect(sent.items).toEqual([{ variant_id: 'v1', quantity: 24 }])
    expect(sent.customer?.phone).toBe('254712345678')
  })

  it('never writes to orders/order_items from the browser', async () => {
    await checkout(makeInput())
    expect(mockCalls()).toHaveLength(0)
  })

  it('surfaces the server-side validation error verbatim', async () => {
    mockInvoke('checkout', () => ({
      data: null,
      error: {
        message: 'FunctionsHttpError',
        context: {
          json: async () => ({
            error: 'Insufficient stock for SKU FFM-SV-236 (available 50)',
          }),
        },
      },
    }))

    await expect(checkout(makeInput())).rejects.toThrow(/Insufficient stock/)
  })

  it('fails loudly when the function is unreachable', async () => {
    mockInvoke('checkout', () => {
      throw new TypeError('fetch failed')
    })

    await expect(checkout(makeInput())).rejects.toThrow()
  })

  it('rejects a malformed success payload instead of rendering NaN totals', async () => {
    mockInvoke('checkout', () => ({ data: { order_id: 'o1' }, error: null }))

    await expect(checkout(makeInput())).rejects.toThrow(/unexpected response/)
  })
})
