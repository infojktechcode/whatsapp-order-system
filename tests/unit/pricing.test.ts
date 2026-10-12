import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabase, mockTable, resetMocks } from '../helpers/mockSupabase.js'

vi.mock('../../src/lib/supabase.js', async () => ({ supabase: mockSupabase }))

import { calculateOrderTotal } from '../../src/services/pricing.service.js'

const VARIANT = {
  id: 'v1',
  retail_price: 500,
  wholesale_price: 400,
  wholesale_threshold: 12,
  stock_quantity: 100,
  active: true,
}

function primeCatalogue(variant: Partial<typeof VARIANT> = {}) {
  mockTable('product_variants', () => ({ data: { ...VARIANT, ...variant }, error: null }))
  // No quantity tiers: pricing falls back to retail/wholesale columns.
  mockTable('pricing_tiers', () => ({ data: [], error: null }))
}

describe('pricing engine', () => {
  beforeEach(() => {
    resetMocks()
    primeCatalogue()
  })

  it('uses the retail price below the wholesale threshold', async () => {
    const result = await calculateOrderTotal([{ variant_id: 'v1', quantity: 5 }])
    expect(result.items[0].unit_price).toBe(500)
    expect(result.items[0].pricing_tier).toBe('retail')
    expect(result.subtotal).toBe(2500)
  })

  it('switches to the wholesale price at the threshold', async () => {
    const result = await calculateOrderTotal(
      [{ variant_id: 'v1', quantity: 12 }],
      0,
      0,
      'wholesale'
    )
    expect(result.items[0].unit_price).toBe(400)
    expect(result.items[0].pricing_tier).toBe('wholesale')
    expect(result.subtotal).toBe(4800)
  })

  it('keeps retail pricing for retail customers even above the threshold', async () => {
    const result = await calculateOrderTotal([{ variant_id: 'v1', quantity: 24 }], 0, 0, 'retail')
    expect(result.items[0].unit_price).toBe(500)
  })

  it('rejects quantities above available stock', async () => {
    // Stock is 100; 200 is above stock but below the 500 safety cap.
    await expect(calculateOrderTotal([{ variant_id: 'v1', quantity: 200 }])).rejects.toThrow(
      /exceeds available stock/
    )
  })

  it('rejects absurd quantities above the safety cap', async () => {
    await expect(calculateOrderTotal([{ variant_id: 'v1', quantity: 5000 }])).rejects.toThrow(
      /maximum/
    )
  })

  it('rejects non-integer and zero quantities', async () => {
    await expect(calculateOrderTotal([{ variant_id: 'v1', quantity: 0 }])).rejects.toThrow()
    await expect(calculateOrderTotal([{ variant_id: 'v1', quantity: 1.5 }])).rejects.toThrow()
  })

  it('rejects inactive variants', async () => {
    primeCatalogue({ active: false })
    await expect(calculateOrderTotal([{ variant_id: 'v1', quantity: 1 }])).rejects.toThrow(
      /inactive/
    )
  })

  it('adds the delivery fee and applies the discount', async () => {
    const result = await calculateOrderTotal([{ variant_id: 'v1', quantity: 2 }], 300, 50)
    expect(result.subtotal).toBe(1000)
    expect(result.delivery_fee).toBe(300)
    expect(result.discount).toBe(50)
    expect(result.total).toBe(1250)
  })

  it('caps the discount at the subtotal so the total never goes negative', async () => {
    const result = await calculateOrderTotal([{ variant_id: 'v1', quantity: 1 }], 0, 999999)
    expect(result.discount).toBe(result.subtotal)
    expect(result.total).toBe(0)
  })
})
