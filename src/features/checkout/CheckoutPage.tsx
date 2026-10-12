import { useCartStore } from "../cart/useCartStore.js"
import { Link } from "react-router-dom"

export function CheckoutPage() {
  const { items, clear } = useCartStore()

  if (!items.length) {
    return (
      <div className="p-4 text-gray-500">
        Your cart is empty.{" "}
        <Link to="/" className="underline">
          Browse products
        </Link>
      </div>
    )
  }

  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0)

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Checkout</h1>

      <ul className="divide-y rounded-lg border">
        {items.map((item) => (
          <li key={item.variant_id} className="flex justify-between p-3 text-sm">
            <span>
              {item.variant?.scent?.name ?? item.variant?.sku ?? item.variant_id} x {item.quantity}
            </span>
            <span>KES {item.line_total.toLocaleString()}</span>
          </li>
        ))}
      </ul>

      <div className="flex justify-between text-sm font-semibold">
        <span>Subtotal</span>
        <span>KES {subtotal.toLocaleString()}</span>
      </div>

      <p className="text-xs text-gray-500">
        Wholesale tiers, delivery fees and discounts are recalculated on the server when the order
        is placed — the figures above are indicative only.
      </p>

      <div className="flex gap-2">
        <Link
          to="/delivery"
          className="flex-1 rounded-lg bg-[#25D366] py-3 text-center text-white"
        >
          Continue to delivery
        </Link>
        <button
          type="button"
          onClick={clear}
          className="rounded-lg border px-4 py-3 text-sm text-gray-600"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
