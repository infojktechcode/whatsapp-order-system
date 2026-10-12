import { create } from 'zustand'
import type { CartItem } from '../../types/index.js'

interface CartState {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'line_total'> & { line_total: number }) => void
  removeItem: (variant_id: string) => void
  updateQuantity: (variant_id: string, quantity: number) => void
  clear: () => void
  count: number
  total: number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.variant_id === item.variant_id)
      if (existing) {
        const updated = state.items.map((i) =>
          i.variant_id === item.variant_id
            ? { ...i, quantity: i.quantity + item.quantity, line_total: i.unit_price * (i.quantity + item.quantity) }
            : i,
        )
        return { items: updated, count: updated.reduce((s, i) => s + i.quantity, 0), total: updated.reduce((s, i) => s + i.line_total, 0) }
      }
      const items = [...state.items, item]
      return { items, count: items.reduce((s, i) => s + i.quantity, 0), total: items.reduce((s, i) => s + i.line_total, 0) }
    }),
  removeItem: (variant_id) =>
    set((state) => {
      const items = state.items.filter((i) => i.variant_id !== variant_id)
      return { items, count: items.reduce((s, i) => s + i.quantity, 0), total: items.reduce((s, i) => s + i.line_total, 0) }
    }),
  updateQuantity: (variant_id, quantity) =>
    set((state) => {
      if (quantity <= 0) return get().removeItem(variant_id) as unknown as CartState
      const items = state.items.map((i) => (i.variant_id === variant_id ? { ...i, quantity, line_total: i.unit_price * quantity } : i))
      return { items, count: items.reduce((s, i) => s + i.quantity, 0), total: items.reduce((s, i) => s + i.line_total, 0) }
    }),
  clear: () => set({ items: [], count: 0, total: 0 }),
  count: 0,
  total: 0,
}))
