import { supabase } from '../../lib/supabase.js'
import type { WhatsAppStep } from '../../types/index.js'

type ProductRow = { id: string; name: string }
type VariantRow = { id: string; size: string; retail_price?: number; scent_id?: string }

export async function getConversation(convId: string) {
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('conversation_id', convId)
    .single()
  if (error) return null
  return data
}

export async function updateConversationStep(
  convId: string,
  step: WhatsAppStep,
  updates: Record<string, unknown> = {}
) {
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .update({ current_step: step, ...updates, updated_at: new Date().toISOString() })
    .eq('conversation_id', convId)
    .select()
    .single()
  if (error) throw new Error('Conversation update failed')
  return data
}

export async function handleWhatsAppMessage(convId: string, phone: string, text: string) {
  // Persist inbound message
  await supabase.from('whatsapp_messages').insert({
    conversation_id: convId,
    direction: 'inbound',
    message_type: 'text',
    from_phone: phone,
    content: text,
    processed: false,
  })

  const conv = await getConversation(convId)
  const currentStep = conv?.current_step ?? 'BROWSING'

  let reply: string
  switch (currentStep) {
    case 'BROWSING': {
      if (text === '1') {
        const { data } = await supabase.from('products').select('id, name').eq('active', true)
        const list = data?.map((p: ProductRow, i: number) => `${i + 1}. ${p.name}`).join('\n') ?? 'No products.'
        reply = `Choose a category:\n\n${list}`
        await updateConversationStep(convId, 'SELECTING_PRODUCT')
      } else if (text === '2') {
        reply = 'Wholesale ordering - select a product.'
        await updateConversationStep(convId, 'SELECTING_PRODUCT')
      } else if (text === '3') {
        reply = 'Send your order number to track.'
      } else if (text === '4') {
        reply = 'Connecting you to an agent.'
      } else {
        reply =
          'Hello! Welcome to Dear Body. What would you like?\n1. Shop Products\n2. Wholesale\n3. Track Order\n4. Talk to an Agent'
      }
      break
    }
    case 'SELECTING_PRODUCT': {
      const { data } = await supabase.from('products').select('id, name').eq('active', true)
      const idx = parseInt(text, 10) - 1
      if (!data || Number.isNaN(idx) || idx < 0 || idx >= data.length) {
        reply = 'Invalid choice. Pick a number.'
      } else {
        const product = data[idx]
        const { data: variants } = await supabase
          .from('product_variants')
          .select('id, scent_id, size')
          .eq('product_id', product.id)
          .eq('active', true)
        const list = variants?.map((v: VariantRow, i: number) => `${i + 1}. ${v.size}`).join('\n') ?? 'No variants.'
        reply = `${product.name} - choose a variant:\n\n${list}`
        await updateConversationStep(convId, 'SELECTING_VARIANT', { selected_product_id: product.id })
      }
      break
    }
    case 'SELECTING_VARIANT': {
      const productId = conv?.selected_product_id
      if (!productId) {
        reply = 'Please go back and choose a product.'
        break
      }
      const { data } = await supabase
        .from('product_variants')
        .select('id, scent_id, size, retail_price')
        .eq('product_id', productId)
        .eq('active', true)
      const idx = parseInt(text, 10) - 1
      if (!data || Number.isNaN(idx) || idx < 0 || idx >= data.length) {
        reply = 'Invalid choice.'
      } else {
        const variant = data[idx]
        reply = `${variant.size} - KES ${variant.retail_price.toLocaleString()}. Quantity?`
        await updateConversationStep(convId, 'SELECTING_QUANTITY', { selected_variant_id: variant.id })
      }
      break
    }
    case 'SELECTING_QUANTITY': {
      const qty = parseInt(text, 10)
      if (Number.isNaN(qty) || qty < 1) {
        reply = 'Enter a valid quantity.'
        break
      }
      reply = `Quantity: ${qty}. Confirm? (yes/no)`
      await updateConversationStep(convId, 'DELIVERY_INFORMATION', { quantity: qty })
      break
    }
    case 'DELIVERY_INFORMATION': {
      reply = 'Delivery - 1. Pickup  2. Courier  3. Bus'
      await updateConversationStep(convId, 'ORDER_REVIEW')
      break
    }
    case 'ORDER_REVIEW': {
      reply = 'Confirm order? (yes/no)'
      await updateConversationStep(convId, 'PAYMENT')
      break
    }
    case 'PAYMENT': {
      reply = 'M-Pesa STK push initiated. Check your phone.'
      await updateConversationStep(convId, 'CONFIRMATION')
      break
    }
    case 'CONFIRMATION': {
      reply = 'Order confirmed. Thank you!'
      await updateConversationStep(convId, 'BROWSING')
      break
    }
    default:
      reply = 'Sorry, something went wrong. Start again: 1. Shop  2. Wholesale  3. Track  4. Agent'
  }

  // Persist outbound reply
  await supabase.from('whatsapp_messages').insert({
    conversation_id: convId,
    direction: 'outbound',
    message_type: 'text',
    to_phone: phone,
    content: reply,
    processed: true,
  })
  return reply
}
