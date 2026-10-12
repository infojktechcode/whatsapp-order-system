// The checkout Edge Function's request boundary. parseCheckout() is the pure
// validator used by supabase/functions/checkout/index.ts — these tests prove
// that any client-sent price, fee, discount, total or customer id is refused
// with a 400 before create_order() is ever reached (AGENTS.md §3).

import { describe, it, expect } from 'vitest'
import { parseCheckout } from '../../supabase/functions/checkout/parse.ts'
import { ValidationError } from '../../supabase/functions/_shared/validate.ts'

const VARIANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const COUNTY_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const METHOD_ID = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

const VALID = {
  items: [{ variant_id: VARIANT_ID, quantity: 2 }],
  customer: { phone: '0712345678', name: 'Jane Wanjiku' },
  customer_type: 'retail',
  delivery: { type: 'courier', county_id: COUNTY_ID, method_id: METHOD_ID },
  channel: 'web',
  customer_notes: 'Leave at the gate',
}

describe('parseCheckout — accepts legitimate input', () => {
  it('parses a valid payload and normalises the phone number', () => {
    const parsed = parseCheckout(VALID)
    expect(parsed.customer.phone).toBe('254712345678')
    expect(parsed.items).toEqual([{ variant_id: VARIANT_ID, quantity: 2 }])
    expect(parsed.delivery.type).toBe('courier')
    expect(parsed.channel).toBe('web')
  })

  it('applies safe defaults for optional enums', () => {
    const parsed = parseCheckout({
      items: [{ variant_id: VARIANT_ID, quantity: 1 }],
      customer: { phone: '254712345678' },
    })
    expect(parsed.customer_type).toBe('retail')
    expect(parsed.delivery.type).toBe('pickup')
    expect(parsed.channel).toBe('web')
    expect(parsed.delivery.county_id).toBeNull()
    expect(parsed.customer_notes).toBeNull()
  })

  it('accepts an address as free text or as an object', () => {
    const asText = parseCheckout({ ...VALID, delivery: { type: 'pickup', address: 'Thika Town' } })
    expect(asText.delivery.address).toEqual({ text: 'Thika Town' })

    const asObject = parseCheckout({
      ...VALID,
      delivery: { type: 'courier', address: { street: 'Moi Avenue', city: 'Nairobi' } },
    })
    expect(asObject.delivery.address).toEqual({ street: 'Moi Avenue', city: 'Nairobi' })
  })
})

describe('parseCheckout — rejects client-sent prices and fees', () => {
  const FORBIDDEN_TOP_LEVEL = [
    'delivery_fee',
    'discount',
    'subtotal',
    'total',
    'amount',
    'price',
    'unit_price',
    'line_total',
    'retail_price',
    'wholesale_price',
    'customer_id',
  ]

  for (const field of FORBIDDEN_TOP_LEVEL) {
    it(`refuses a top-level "${field}"`, () => {
      expect(() => parseCheckout({ ...VALID, [field]: 500 })).toThrow(ValidationError)
      expect(() => parseCheckout({ ...VALID, [field]: 500 })).toThrow(/must not be sent/)
    })
  }

  it('refuses a price smuggled inside an item line', () => {
    expect(() =>
      parseCheckout({
        ...VALID,
        items: [{ variant_id: VARIANT_ID, quantity: 1, unit_price: 1 }],
      })
    ).toThrow(/must not be sent/)
  })

  it('refuses a price smuggled inside the customer object', () => {
    expect(() =>
      parseCheckout({
        ...VALID,
        customer: { phone: '254712345678', discount_code: 'SAVE10' },
      })
    ).toThrow(/unexpected field/)
  })

  it('refuses unknown top-level fields outright (no silent ignoring)', () => {
    expect(() => parseCheckout({ ...VALID, is_admin: true })).toThrow(/unexpected field/)
    expect(() => parseCheckout({ ...VALID, status_slug: 'paid' })).toThrow(/unexpected field/)
  })
})

describe('parseCheckout — rejects malformed input', () => {
  it('refuses an empty item list', () => {
    expect(() => parseCheckout({ ...VALID, items: [] })).toThrow(/non-empty array/)
  })

  it('refuses a non-array items value', () => {
    expect(() => parseCheckout({ ...VALID, items: 'everything' })).toThrow(/non-empty array/)
  })

  it('refuses a quantity outside 1..500', () => {
    expect(() =>
      parseCheckout({ ...VALID, items: [{ variant_id: VARIANT_ID, quantity: 0 }] })
    ).toThrow(/integer between/)
    expect(() =>
      parseCheckout({ ...VALID, items: [{ variant_id: VARIANT_ID, quantity: 501 }] })
    ).toThrow(/integer between/)
  })

  it('refuses a non-UUID variant id', () => {
    expect(() =>
      parseCheckout({ ...VALID, items: [{ variant_id: 'drop-table', quantity: 1 }] })
    ).toThrow(/valid UUID/)
  })

  it('refuses a missing phone number', () => {
    expect(() => parseCheckout({ ...VALID, customer: {} })).toThrow(/phone/)
  })

  it('refuses a non-Kenyan phone number', () => {
    expect(() =>
      parseCheckout({ ...VALID, customer: { phone: '+14155552671' } })
    ).toThrow(/Kenyan number/)
  })

  it('refuses an invalid email address', () => {
    expect(() =>
      parseCheckout({ ...VALID, customer: { phone: '254712345678', email: 'not-an-email' } })
    ).toThrow(/not a valid email/)
  })

  it('refuses an invalid delivery type', () => {
    expect(() =>
      parseCheckout({ ...VALID, delivery: { type: 'teleport' } })
    ).toThrow(/must be one of/)
  })

  it('refuses a non-object body', () => {
    expect(() => parseCheckout(null)).toThrow(/JSON object/)
    expect(() => parseCheckout('items')).toThrow(/JSON object/)
    expect(() => parseCheckout([])).toThrow(/JSON object/)
  })
})
