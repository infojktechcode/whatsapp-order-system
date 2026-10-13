// Admin panel → Edge Function contract. The browser must never touch orders or
// transition statuses directly; every call is a single `admin` invoke whose
// body is an action plus ids.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  mockSupabase,
  resetMocks,
  mockInvoke,
  mockInvokeCalls,
  mockAuth,
  mockAuthCalls,
  mockCalls,
} from '../helpers/mockSupabase.js'

vi.mock('../../src/lib/supabase.js', async () => ({ supabase: mockSupabase }))

import {
  adminGetOrder,
  adminListOrders,
  adminMe,
  adminStats,
  adminTransition,
  signInAdmin,
  signOutAdmin,
} from '../../src/services/admin.service.js'

const ORDER_ID = '10000001-0000-0000-0000-000000000009'

const ORDER_ROW = {
  id: ORDER_ID,
  order_number: 'DB-20261012-ABC123',
  created_at: '2026-10-12T10:00:00Z',
  total: 2100,
  status: 'awaiting_payment',
  customer_phone: '254712345678',
  customer_name: 'Jane',
  payment_status: 'processing',
  mpesa_receipt_number: null,
}

describe('admin service', () => {
  beforeEach(() => {
    resetMocks()
    mockInvoke('admin', () => ({ data: { orders: [ORDER_ROW] }, error: null }))
  })

  describe('auth', () => {
    it('signs in with email and password only', async () => {
      mockAuth('signInWithPassword', () => ({ data: { user: {} }, error: null }))

      await signInAdmin('  admin@dearbody.co.ke ', 'sup3r-secret')

      const [call] = mockAuthCalls()
      expect(call.fn).toBe('signInWithPassword')
      expect(call.args).toEqual({
        email: 'admin@dearbody.co.ke',
        password: 'sup3r-secret',
      })
    })

    it('surfaces the auth error message', async () => {
      mockAuth('signInWithPassword', () => ({
        data: null,
        error: { message: 'Invalid login credentials' },
      }))

      await expect(signInAdmin('admin@dearbody.co.ke', 'wrong')).rejects.toThrow(
        /Invalid login credentials/
      )
    })

    it('signs out', async () => {
      mockAuth('signOut', () => ({ data: {}, error: null }))
      await signOutAdmin()
      expect(mockAuthCalls().map((c) => c.fn)).toEqual(['signOut'])
    })
  })

  describe('list_orders', () => {
    it('sends only the action (and optional filter)', async () => {
      const rows = await adminListOrders()

      expect(rows).toHaveLength(1)
      expect(rows[0].order_number).toBe('DB-20261012-ABC123')
      expect(mockInvokeCalls('admin')[0].body).toEqual({ action: 'list_orders' })
    })

    it('passes a status filter through', async () => {
      await adminListOrders({ status: 'awaiting_payment', limit: 5 })
      expect(mockInvokeCalls('admin')[0].body).toEqual({
        action: 'list_orders',
        status: 'awaiting_payment',
        limit: 5,
      })
    })

    it('never queries the orders table from the browser', async () => {
      await adminListOrders()
      expect(mockCalls()).toHaveLength(0)
    })

    it('rejects a malformed payload', async () => {
      mockInvoke('admin', () => ({ data: { orders: 'nope' }, error: null }))
      await expect(adminListOrders()).rejects.toThrow(/unexpected response/)
    })
  })

  describe('get_order', () => {
    it('requests one order by id', async () => {
      mockInvoke('admin', () => ({
        data: {
          order: {
            ...ORDER_ROW,
            subtotal: 1700,
            discount: 0,
            delivery_fee: 400,
            channel: 'web',
            delivery_type: 'courier',
            delivery_address: { text: 'Thika' },
            customer_notes: null,
            paid_at: null,
            customer: { phone: '254712345678', name: 'Jane', email: null },
            items: [],
            payment: null,
            history: [],
            allowed_transitions: ['cancelled'],
          },
        },
        error: null,
      }))

      const order = await adminGetOrder(ORDER_ID)

      expect(order.allowed_transitions).toEqual(['cancelled'])
      expect(mockInvokeCalls('admin')[0].body).toEqual({
        action: 'get_order',
        order_id: ORDER_ID,
      })
    })

    it('surfaces the server 404 for an unknown order', async () => {
      mockInvoke('admin', () => ({
        data: null,
        error: {
          message: 'FunctionsHttpError',
          context: { json: async () => ({ error: 'Order not found' }) },
        },
      }))

      await expect(adminGetOrder(ORDER_ID)).rejects.toThrow(/Order not found/)
    })
  })

  describe('transition', () => {
    beforeEach(() => {
      mockInvoke('admin', () => ({
        data: {
          order_id: ORDER_ID,
          order_number: 'DB-20261012-ABC123',
          from: 'awaiting_payment',
          to: 'cancelled',
          changed: true,
        },
        error: null,
      }))
    })

    it('asks the server to move the order — never sets status directly', async () => {
      const result = await adminTransition(ORDER_ID, 'cancelled', 'customer asked')

      expect(result.changed).toBe(true)
      expect(mockInvokeCalls('admin')[0].body).toEqual({
        action: 'transition',
        order_id: ORDER_ID,
        to_status: 'cancelled',
        reason: 'customer asked',
      })
      expect(mockCalls()).toHaveLength(0)
    })

    it('omits an empty reason', async () => {
      await adminTransition(ORDER_ID, 'cancelled', '')
      expect(mockInvokeCalls('admin')[0].body).not.toHaveProperty('reason')
    })

    it('surfaces a refused transition verbatim', async () => {
      mockInvoke('admin', () => ({
        data: null,
        error: {
          message: 'FunctionsHttpError',
          context: {
            json: async () => ({ error: 'That status change is not allowed for this order' }),
          },
        },
      }))

      await expect(adminTransition(ORDER_ID, 'confirmed')).rejects.toThrow(/not allowed/)
    })

    it('surfaces a 403 when the role cannot transition', async () => {
      mockInvoke('admin', () => ({
        data: null,
        error: {
          message: 'FunctionsHttpError',
          context: { json: async () => ({ error: 'Your role cannot change order status' }) },
        },
      }))

      await expect(adminTransition(ORDER_ID, 'confirmed')).rejects.toThrow(
        /Your role cannot change order status/
      )
    })
  })

  describe('stats and profile', () => {
    it('maps stats', async () => {
      mockInvoke('admin', () => ({
        data: {
          orders_total: 3,
          orders_by_status: { awaiting_payment: 2, delivered: 1 },
          paid_total: 4200,
          low_stock_variants: 1,
        },
        error: null,
      }))

      const stats = await adminStats()

      expect(stats.orders_total).toBe(3)
      expect(stats.paid_total).toBe(4200)
      expect(mockInvokeCalls('admin')[0].body).toEqual({ action: 'stats' })
    })

    it('returns the signed-in admin profile', async () => {
      mockInvoke('admin', () => ({
        data: {
          profile: { name: 'Jane', email: 'j@dearbody.co.ke', role: 'admin', can_transition: true },
        },
        error: null,
      }))

      const profile = await adminMe()

      expect(profile.role).toBe('admin')
      expect(profile.can_transition).toBe(true)
      expect(mockInvokeCalls('admin')[0].body).toEqual({ action: 'me' })
    })

    it('surfaces the 403 for a signed-in non-admin', async () => {
      mockInvoke('admin', () => ({
        data: null,
        error: {
          message: 'FunctionsHttpError',
          context: { json: async () => ({ error: 'Admin access required' }) },
        },
      }))

      await expect(adminMe()).rejects.toThrow(/Admin access required/)
    })
  })
})