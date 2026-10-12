// Shared state for the guest checkout flow: what the customer typed on the
// delivery page, and the order the server created. Nothing here is a price the
// server trusts — totals always come back from create_order() via checkout().

import { create } from 'zustand'
import type { DeliveryType } from '../../types/index.js'

export interface CheckoutCustomerInput {
  name: string
  phone: string
}

export interface CheckoutDeliveryInput {
  type: DeliveryType
  county_id: string
  /** Display-only, captured so the review step can name the county. */
  county_name: string
  method_id: string
  pickup_point_id: string | null
  address: string
}

export interface PlacedOrder {
  order_id: string
  order_number: string
  status_token: string
}

interface CheckoutState {
  customer: CheckoutCustomerInput
  delivery: CheckoutDeliveryInput | null
  placed: PlacedOrder | null
  setCustomer: (customer: CheckoutCustomerInput) => void
  setDelivery: (delivery: CheckoutDeliveryInput) => void
  setPlaced: (placed: PlacedOrder) => void
  /** Clears the placed order (after success) but keeps customer + delivery
   *  so a repeat purchase in the same session is one tap. */
  clearPlaced: () => void
}

/** Light client-side check so the Place order button doesn't fire doomed
 *  requests; the server still validates with the same rule. */
export function looksLikeKenyanPhone(value: string): boolean {
  return /^(?:0|\+?254)[17]\d{8}$/.test(value.replace(/[\s-]/g, ''))
}

export const useCheckoutStore = create<CheckoutState>((set) => ({
  customer: { name: '', phone: '' },
  delivery: null,
  placed: null,
  setCustomer: (customer) => set({ customer }),
  setDelivery: (delivery) => set({ delivery }),
  setPlaced: (placed) => set({ placed }),
  clearPlaced: () => set({ placed: null }),
}))
