// Guest status polling: the browser presents the capability token from
// checkout and reads back the authoritative order/payment state. Read-only —
// no tables may ever be touched directly.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  mockSupabase,
  resetMocks,
  mockInvoke,
  mockInvokeCalls,
  mockCalls,
} from '../helpers/mockSupabase.js'

vi.mock('../../src/lib/supabase.js', async () => ({ supabase: mockSupabase }))

import { getOrderStatus } from '../../src/services/order-status.service.js'

const ORDER_ID = '10000001-0000-0000-0000-000000000009'
const TOKEN = 'c'.repeat(64)

const SERVER_RESULT = {
  order_number: 'DB-20261012-XYZ789',
  status: 'awaiting_payment',
  total: 2100,
  paid_at: null,
  payment: {
    status: 'processing',
    amount: 2100,
    mpesa_receipt_number: null,
    result_description: 'Request accepted for processing',
  },
}

describe('order-status via the Edge Function', () => {
  beforeEach(() => {
    resetMocks()
    mockInvoke('order-status', () => ({ data: SERVER_RESULT, error: null }))
  })

  it('returns the authoritative status and payment state', async () => {
    const result = await getOrderStatus(ORDER_ID, TOKEN)

    expect(result.order_number).toBe('DB-20261012-XYZ789')
    expect(result.status).toBe('awaiting_payment')
    expect(result.total).toBe(2100)
    expect(result.payment?.status).toBe('processing')
  })

  it('posts only the order id and its capability token', async () => {
    await getOrderStatus(ORDER_ID, TOKEN)

    const calls = mockInvokeCalls('order-status')
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toEqual({ order_id: ORDER_ID, status_token: TOKEN })

    const body = JSON.stringify(calls[0].body)
    for (const forbidden of ['amount', 'total', 'status', 'receipt']) {
      // The client cannot influence what it reads — only ask for it.
      expect(body).not.toContain(`"${forbidden}"`)
    }
  })

  it('never touches the database directly', async () => {
    await getOrderStatus(ORDER_ID, TOKEN)
    expect(mockCalls()).toHaveLength(0)
  })

  it('surfaces the server 403 for a rejected token', async () => {
    mockInvoke('order-status', () => ({
      data: null,
      error: {
        message: 'FunctionsHttpError',
        context: { json: async () => ({ error: 'Invalid status token' }) },
      },
    }))

    await expect(getOrderStatus(ORDER_ID, 'f'.repeat(64))).rejects.toThrow(/Invalid status token/)
  })

  it('surfaces the server 404 for an unknown order', async () => {
    mockInvoke('order-status', () => ({
      data: null,
      error: {
        message: 'FunctionsHttpError',
        context: { json: async () => ({ error: 'Order not found' }) },
      },
    }))

    await expect(getOrderStatus(ORDER_ID, TOKEN)).rejects.toThrow(/Order not found/)
  })

  it('rejects a malformed success payload', async () => {
    mockInvoke('order-status', () => ({ data: { status: 'paid' }, error: null }))

    await expect(getOrderStatus(ORDER_ID, TOKEN)).rejects.toThrow(/unexpected response/)
  })

  it('handles a paid order with a receipt', async () => {
    mockInvoke('order-status', () => ({
      data: {
        order_number: 'DB-20261012-PAID1',
        status: 'paid',
        total: 2100,
        paid_at: '2026-10-12T10:00:00Z',
        payment: {
          status: 'completed',
          amount: 2100,
          mpesa_receipt_number: 'SJK4H2L9MN',
          result_description: 'The service request is processed successfully',
        },
      },
      error: null,
    }))

    const result = await getOrderStatus(ORDER_ID, TOKEN)
    expect(result.status).toBe('paid')
    expect(result.payment?.mpesa_receipt_number).toBe('SJK4H2L9MN')
    expect(result.payment?.status).toBe('completed')
  })
})
