// Security contract for M-Pesa STK from the browser's point of view:
// the client sends an order id and a phone number. Nothing else. The amount is
// read server-side from orders.total, and the browser never writes to
// payments / payment_transactions / orders.status.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabase, resetMocks, mockInvoke, mockInvokeCalls, mockCalls } from '../helpers/mockSupabase.js'

vi.mock('../../src/lib/supabase.js', async () => ({ supabase: mockSupabase }))

import { initiateStkPush, verifyPayment } from '../../src/services/payment.service.js'

const ORDER_ID = 'o1'
const PHONE = '254712345678'

const OK_RESPONSE = {
  status: 'requested',
  payment_id: 'p1',
  checkout_request_id: 'ws_CO_123',
  merchant_request_id: 'mr_1',
  amount: 1000,
  order_number: 'DB-20261012-ABC123',
}

function httpError(status: number, message: string) {
  return {
    data: null,
    error: {
      message: `FunctionsHttpError: HTTP ${status}`,
      context: { json: async () => ({ error: message }) },
    },
  }
}

describe('M-Pesa STK push via the Edge Function', () => {
  beforeEach(() => {
    resetMocks()
    mockInvoke('mpesa-stk', () => ({ data: OK_RESPONSE, error: null }))
  })

  it('sends only order_id + phone — never an amount or total', async () => {
    const result = await initiateStkPush(ORDER_ID, PHONE)

    expect(result.status).toBe('requested')
    // The amount we display is the one the server computed and echoed back.
    expect(result.amount).toBe(1000)
    expect(result.checkout_request_id).toBe('ws_CO_123')

    const calls = mockInvokeCalls('mpesa-stk')
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toEqual({ order_id: ORDER_ID, phone: PHONE })

    const body = JSON.stringify(calls[0].body)
    expect(body).not.toContain('amount')
    expect(body).not.toContain('total')
  })

  it('performs zero table writes — payments belong to the server', async () => {
    await initiateStkPush(ORDER_ID, PHONE)
    expect(mockCalls()).toHaveLength(0)
  })

  it('refuses to pay for an order that is not awaiting payment (409)', async () => {
    mockInvoke('mpesa-stk', () => httpError(409, 'Order is not awaiting payment (status: paid)'))

    await expect(initiateStkPush(ORDER_ID, PHONE)).rejects.toThrow(
      /not awaiting payment/
    )
    expect(mockCalls('payments')).toHaveLength(0)
  })

  it('reports a missing order without creating anything', async () => {
    mockInvoke('mpesa-stk', () => httpError(404, 'Order not found'))

    await expect(initiateStkPush(ORDER_ID, PHONE)).rejects.toThrow(/Order not found/)
    expect(mockCalls('payments')).toHaveLength(0)
  })

  it('passes through the already_requested guard instead of double-charging', async () => {
    mockInvoke('mpesa-stk', () => ({
      data: { ...OK_RESPONSE, status: 'already_requested' },
      error: null,
    }))

    const result = await initiateStkPush(ORDER_ID, PHONE)
    expect(result.status).toBe('already_requested')
    expect(result.checkout_request_id).toBe('ws_CO_123')
    expect(mockInvokeCalls('mpesa-stk')).toHaveLength(1)
  })

  it('surfaces the server message when M-Pesa is not configured (503)', async () => {
    mockInvoke('mpesa-stk', () => httpError(503, 'M-Pesa is not configured (missing MPESA_* secrets)'))

    await expect(initiateStkPush(ORDER_ID, PHONE)).rejects.toThrow(/not configured/)
  })

  it('flags an unexpected success payload instead of pretending payment worked', async () => {
    mockInvoke('mpesa-stk', () => ({ data: { status: 'paid' }, error: null }))

    const result = await initiateStkPush(ORDER_ID, PHONE)
    expect(result.status).toBe('error')
  })
})

describe('verifyPayment (read-only)', () => {
  beforeEach(() => resetMocks())

  it('reads the payment row without mutating anything', async () => {
    const { mockTable, oneRow } = await import('../helpers/mockSupabase.js')
    mockTable('payments', () => oneRow({ id: 'p1', order_id: ORDER_ID, status: 'processing' }))

    const payment = await verifyPayment(ORDER_ID)
    expect(payment?.status).toBe('processing')

    const writes = mockCalls('payments').filter((c) => c.state.mutation !== null)
    expect(writes).toHaveLength(0)
  })

  it('returns null when there is no payment row yet', async () => {
    const { mockTable } = await import('../helpers/mockSupabase.js')
    mockTable('payments', () => ({ data: null, error: null }))

    await expect(verifyPayment(ORDER_ID)).resolves.toBeNull()
  })
})
