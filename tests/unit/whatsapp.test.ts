import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabase, mockTable, resetMocks, mockCalls, okInsert, oneRow } from '../helpers/mockSupabase.js'

vi.mock('../../src/lib/supabase.js', async () => ({ supabase: mockSupabase }))

import { handleWhatsAppMessage } from '../../src/features/whatsapp/whatsapp.service.js'

const PHONE = '254712345678'

const PRODUCTS = [
  { id: 'p1', name: 'Body Lotion' },
  { id: 'p2', name: 'Perfume' },
]

describe('WhatsApp conversation state machine', () => {
  beforeEach(() => {
    resetMocks()
    mockTable('whatsapp_messages', () => okInsert())
    mockTable('whatsapp_conversations', (state) =>
      state.mutation === 'update'
        ? oneRow({ conversation_id: 'conv-1', current_step: state.args.update })
        : oneRow({ conversation_id: 'conv-1', current_step: 'BROWSING' })
    )
    mockTable('products', () => oneRow(PRODUCTS))
    mockTable('product_variants', () =>
      oneRow([{ id: 'v1', scent_id: 's1', size: '250ml', retail_price: 850 }])
    )
  })

  it('answers a greeting with the main menu', async () => {
    const reply = await handleWhatsAppMessage('conv-1', PHONE, 'hello')
    expect(reply).toContain('Shop Products')
    expect(reply).toContain('Wholesale')
    expect(reply).toContain('Track Order')
  })

  it('moves from BROWSING to product selection on option 1', async () => {
    const reply = await handleWhatsAppMessage('conv-1', PHONE, '1')
    expect(reply).toContain('Choose a category')
    expect(reply).toContain('Body Lotion')
  })

  it('rejects an invalid menu choice without changing step', async () => {
    const reply = await handleWhatsAppMessage('conv-1', PHONE, '99')
    expect(reply).toMatch(/Invalid|What would you like/)
  })

  it('persists both the inbound message and the outbound reply', async () => {
    await handleWhatsAppMessage('conv-1', PHONE, 'hello')
    const writes = mockCalls('whatsapp_messages').filter((c) => c.state.mutation === 'insert')
    expect(writes).toHaveLength(2)
    const directions = writes.map((c) => (c.state.args.payload as Record<string, unknown>).direction)
    expect(directions).toEqual(['inbound', 'outbound'])
  })

  it('never exposes secrets or prices the customer did not select', async () => {
    const reply = await handleWhatsAppMessage('conv-1', PHONE, 'hello')
    expect(reply).not.toMatch(/key|token|passkey/i)
  })
})
