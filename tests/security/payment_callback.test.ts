import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabase, mockTable, resetMocks, mockCalls, oneRow, noRows } from '../helpers/mockSupabase.js'

vi.mock('../../src/lib/supabase.js', async () => ({ supabase: mockSupabase }))

import { initiateStkPush } from '../../src/services/payment.service.js'

const ORDER_ID = 'o1'
const PHONE = '254712345678'

function primeOrder(statusId = 'awaiting_payment') {
  mockTable('orders', () => oneRow({ id: ORDER_ID, total: 1000, status_id: statusId }))
}

describe('M-Pesa STK push', () => {
  beforeEach(() => {
    resetMocks()
    primeOrder()
  })

  it('creates a payment row in "requested" state — never completed', async () => {
    mockTable('payments', (state) =>
      state.mutation === 'insert'
        ? { data: { id: 'p1', status: 'requested', checkout_request_id: null, merchant_request_id: null }, error: null }
        : noRows()
    )

    const result = await initiateStkPush(ORDER_ID, PHONE, 1000)
    expect(result.status).toBe('requested')

    const insert = mockCalls('payments').find((c) => c.state.mutation === 'insert')
    const payload = insert?.state.args.payload as Record<string, unknown>
    expect(payload.status).toBe('requested')
    expect(payload.status).not.toBe('completed')
  })

  it('refuses to request payment for an order that is not AWAITING_PAYMENT', async () => {
    primeOrder('paid')
    mockTable('payments', () => noRows())

    await expect(initiateStkPush(ORDER_ID, PHONE, 1000)).rejects.toThrow(/AWAITING_PAYMENT/)
    expect(mockCalls('payments').some((c) => c.state.mutation === 'insert')).toBe(false)
  })

  it('returns an error instead of creating a payment for a missing order', async () => {
    mockTable('orders', () => noRows())
    mockTable('payments', () => noRows())

    const result = await initiateStkPush(ORDER_ID, PHONE, 1000)
    expect(result.status).toBe('error')
  })

  it('is idempotent: an outstanding STK request is not duplicated', async () => {
    mockTable('payments', () =>
      oneRow({ id: 'p0', checkout_request_id: 'ws_CO_123', status: 'requested' })
    )

    const result = await initiateStkPush(ORDER_ID, PHONE, 1000)
    expect(result.status).toBe('already_requested')
    expect(result.checkout_request_id).toBe('ws_CO_123')
    expect(mockCalls('payments').some((c) => c.state.mutation === 'insert')).toBe(false)
  })

  it('records the phone number and requested timestamp on the payment row', async () => {
    mockTable('payments', (state) =>
      state.mutation === 'insert'
        ? { data: { id: 'p1', status: 'requested', checkout_request_id: null, merchant_request_id: null }, error: null }
        : noRows()
    )

    await initiateStkPush(ORDER_ID, PHONE, 1000)
    const insert = mockCalls('payments').find((c) => c.state.mutation === 'insert')
    const payload = insert?.state.args.payload as Record<string, unknown>
    expect(payload.phone_number).toBe(PHONE)
    expect(typeof payload.requested_at).toBe('string')
  })
})
