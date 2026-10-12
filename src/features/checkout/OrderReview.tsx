import { Link } from "react-router-dom"
import { useCartStore } from "../cart/useCartStore.js"
import { looksLikeKenyanPhone, useCheckoutStore } from "./useCheckoutStore.js"
import type { CartItem } from "../../types/index.js"

// Cart review + delivery/contact summary + place order. All figures here are
// indicative (client display only) — create_order() recomputes everything.

function cartLabel(item: CartItem): string {
  if (!item.variant) return item.variant_id
  const product = item.product?.name ? `${item.product.name} — ` : ""
  const name = item.variant.scent?.name ?? item.variant.sku
  return `${product}${name} ${item.variant.size}`
}

export function OrderReview({
  busy,
  error,
  onPlaceOrder,
}: {
  busy: boolean
  error: string | null
  onPlaceOrder: () => void
}) {
  const items = useCartStore((s) => s.items)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const clear = useCartStore((s) => s.clear)
  const { delivery, customer, placed } = useCheckoutStore()

  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0)
  const ready = items.length > 0 && Boolean(delivery) && looksLikeKenyanPhone(customer.phone)

  if (!items.length && !placed) {
    return (
      <div className="p-4 text-gray-500">
        Your cart is empty.{" "}
        <Link to="/" className="underline">
          Browse products
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Checkout</h1>

      {placed && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Order {placed.order_number} was created and is waiting for payment.
        </div>
      )}

      {items.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.variant_id} className="p-3 text-sm">
              <div className="flex justify-between">
                <span>{cartLabel(item)}</span>
                <span>KES {item.line_total.toLocaleString()}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.variant_id, item.quantity - 1)}
                  className="h-7 w-7 rounded border text-gray-700"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-8 text-center">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.variant_id, item.quantity + 1)}
                  disabled={Boolean(item.variant && item.quantity >= item.variant.stock_quantity)}
                  className="h-7 w-7 rounded border text-gray-700 disabled:opacity-40"
                  aria-label="Increase quantity"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item.variant_id)}
                  className="ml-auto text-xs text-red-600"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="flex justify-between text-sm font-semibold">
          <span>Indicative subtotal</span>
          <span>KES {subtotal.toLocaleString()}</span>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-600">Delivery</span>
          <span className="text-right">
            {delivery
              ? `${delivery.type}${delivery.county_name ? ` · ${delivery.county_name}` : ""}`
              : "Not set"}
          </span>
        </div>
        {delivery?.address && (
          <div className="flex justify-between">
            <span className="text-gray-600">Address</span>
            <span className="text-right">{delivery.address}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-600">M-Pesa phone</span>
          <span>{customer.phone || "Not set"}</span>
        </div>
        <div className="pt-1">
          <Link to="/delivery" className="text-[#25D366] underline">
            Change delivery details
          </Link>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Wholesale tiers, delivery fees and discounts are recalculated on the server when the order
        is placed — the figures above are indicative only.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPlaceOrder}
          disabled={!ready || busy}
          className="flex-1 rounded-lg bg-[#25D366] py-3 text-center text-white disabled:opacity-50"
        >
          {busy ? "Placing order..." : placed ? "Resume payment" : "Place order"}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={busy}
          className="rounded-lg border px-4 py-3 text-sm text-gray-600 disabled:opacity-50"
        >
          Clear
        </button>
      </div>

      {!delivery && (
        <p className="text-xs text-amber-700">
          Choose a delivery method first on the{" "}
          <Link to="/delivery" className="underline">
            delivery page
          </Link>
          .
        </p>
      )}
      {delivery && !looksLikeKenyanPhone(customer.phone) && (
        <p className="text-xs text-amber-700">
          Add your M-Pesa phone number on the{" "}
          <Link to="/delivery" className="underline">
            delivery page
          </Link>
          .
        </p>
      )}
    </div>
  )
}
