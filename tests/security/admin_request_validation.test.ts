// The admin function's request contract: every action is an allowlist, status
// changes are constrained, and no client may smuggle amounts or write fields.

import { describe, it, expect } from 'vitest'
import { parseAdminRequest, ADMIN_SETTABLE_STATUSES } from '../../supabase/functions/admin/parse.js'
import { ValidationError } from '../../supabase/functions/_shared/validate.js'

const ORDER_ID = '10000001-0000-0000-0000-000000000009'

function expectValidationError(fn: () => unknown): ValidationError {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError)
    return e as ValidationError
  }
  throw new Error('expected a ValidationError')
}

describe('parseAdminRequest', () => {
  it('parses list_orders with defaults', () => {
    expect(parseAdminRequest({ action: 'list_orders' })).toEqual({
      action: 'list_orders',
      status: null,
      limit: 50,
    })
  })

  it('parses a status filter and limit', () => {
    expect(parseAdminRequest({ action: 'list_orders', status: 'awaiting_payment', limit: 10 })).toEqual(
      { action: 'list_orders', status: 'awaiting_payment', limit: 10 }
    )
  })

  it('rejects an unknown status filter', () => {
    expectValidationError(() => parseAdminRequest({ action: 'list_orders', status: 'paid;' }))
      .message
  })

  it('rejects a limit outside the allowed range', () => {
    expectValidationError(() => parseAdminRequest({ action: 'list_orders', limit: 0 }))
    expectValidationError(() => parseAdminRequest({ action: 'list_orders', limit: 500 }))
    expectValidationError(() => parseAdminRequest({ action: 'list_orders', limit: 'ten' }))
  })

  it('parses get_order and normalises the uuid', () => {
    expect(parseAdminRequest({ action: 'get_order', order_id: ORDER_ID.toUpperCase() })).toEqual({
      action: 'get_order',
      order_id: ORDER_ID,
    })
  })

  it('rejects a missing or malformed order id', () => {
    expectValidationError(() => parseAdminRequest({ action: 'get_order' }))
    expectValidationError(() => parseAdminRequest({ action: 'get_order', order_id: 'nope' }))
    expectValidationError(() =>
      parseAdminRequest({ action: 'get_order', order_id: "1' OR '1'='1" })
    )
  })

  it('parses a transition with an optional reason', () => {
    expect(
      parseAdminRequest({ action: 'transition', order_id: ORDER_ID, to_status: 'confirmed' })
    ).toEqual({ action: 'transition', order_id: ORDER_ID, to_status: 'confirmed', reason: null })

    expect(
      parseAdminRequest({
        action: 'transition',
        order_id: ORDER_ID,
        to_status: 'cancelled',
        reason: '  customer asked  ',
      })
    ).toEqual({
      action: 'transition',
      order_id: ORDER_ID,
      to_status: 'cancelled',
      reason: 'customer asked',
    })
  })

  it('rejects an over-long reason', () => {
    expectValidationError(() =>
      parseAdminRequest({
        action: 'transition',
        order_id: ORDER_ID,
        to_status: 'cancelled',
        reason: 'x'.repeat(501),
      })
    )
  })

  it('refuses to let an admin mark an order paid', () => {
    // paid is not settable by hand — only a validated Daraja callback may do it.
    expect(ADMIN_SETTABLE_STATUSES).not.toContain('paid' as never)
    const error = expectValidationError(() =>
      parseAdminRequest({ action: 'transition', order_id: ORDER_ID, to_status: 'paid' })
    )
    expect(error.message).toMatch(/to_status must be one of/)
  })

  it('rejects statuses outside the settable list', () => {
    expectValidationError(() =>
      parseAdminRequest({ action: 'transition', order_id: ORDER_ID, to_status: 'draft' })
    )
    expectValidationError(() =>
      parseAdminRequest({ action: 'transition', order_id: ORDER_ID, to_status: 'pwnd' })
    )
    expectValidationError(() => parseAdminRequest({ action: 'transition', order_id: ORDER_ID }))
  })

  it('rejects price fields on every action', () => {
    for (const body of [
      { action: 'stats', total: 1 },
      { action: 'list_orders', amount: 5 },
      { action: 'get_order', order_id: ORDER_ID, unit_price: 10 },
      { action: 'transition', order_id: ORDER_ID, to_status: 'cancelled', discount: 5 },
    ]) {
      const error = expectValidationError(() => parseAdminRequest(body))
      expect(error.message).toMatch(/computed on the server/)
    }
  })

  it('rejects unknown fields instead of ignoring them', () => {
    const error = expectValidationError(() =>
      parseAdminRequest({ action: 'stats', everything: true })
    )
    expect(error.message).toMatch(/unexpected field/)
  })

  it('rejects an unknown or missing action', () => {
    expectValidationError(() => parseAdminRequest({ action: 'drop_tables' }))
    expectValidationError(() => parseAdminRequest({}))
    expectValidationError(() => parseAdminRequest({ action: '' }))
  })

  it('fails closed on a non-object body instead of guessing an action', () => {
    // A garbage body must not be treated as a harmless stats request.
    for (const body of ['string body', 42, null, undefined, ['list_orders']]) {
      const error = expectValidationError(() => parseAdminRequest(body))
      expect(error.message).toMatch(/must be a JSON object/)
    }
  })

  it('parses stats and me as field-less actions', () => {
    expect(parseAdminRequest({ action: 'stats' })).toEqual({ action: 'stats' })
    expect(parseAdminRequest({ action: 'me' })).toEqual({ action: 'me' })
  })

  it('does not leak one action`s allowed fields into another', () => {
    // `reason` belongs to transition only.
    expectValidationError(() => parseAdminRequest({ action: 'get_order', order_id: ORDER_ID, reason: 'x' }))
  })
})