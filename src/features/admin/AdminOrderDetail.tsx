import { useState } from "react"
import { adminTransition } from "../../services/admin.service.js"
import type { AdminOrderDetail } from "../../services/admin.service.js"

// Detail view for one order: items, totals, payment and the status history,
// plus the transitions this order is allowed to make.
//
// Which transitions are offered is decided by the transition matrix on the
// server; a wrong guess here simply comes back as a 400, never a silent change.

export function AdminOrderDetail({
  order,
  canTransition,
  onChanged,
  onClose,
}: {
  order: AdminOrderDetail
  canTransition: boolean
  onChanged: () => void
  onClose: () => void
}) {
  const [busyStatus, setBusyStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState("")

  const move = async (toStatus: string) => {
    setError(null)
    setBusyStatus(toStatus)
    try {
      await adminTransition(order.id, toStatus, note.trim() || undefined)
      setNote("")
      onChanged()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Status change failed")
    } finally {
      setBusyStatus(null)
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{order.order_number}</h2>
          <p className="text-xs text-gray-500">
            {new Date(order.created_at).toLocaleString()} · {order.channel}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-gray-500 underline">
          Close
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-gray-500">Status</p>
          <p className="font-medium">{order.status.replace(/_/g, " ")}</p>
        </div>
        <div>
          <p className="text-gray-500">Payment</p>
          <p className="font-medium">
            {order.payment ? `${order.payment.status} · KES ${order.payment.amount.toLocaleString()}` : "none"}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Customer</p>
          <p className="font-medium">{order.customer?.name ?? "—"}</p>
          <p className="text-xs text-gray-500">{order.customer?.phone}</p>
        </div>
        <div>
          <p className="text-gray-500">Delivery</p>
          <p className="font-medium">{order.delivery_type}</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500">
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Line</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <tr key={`${item.sku}-${index}`} className="border-b last:border-0">
              <td className="py-1">
                {item.scent_name ?? item.sku}
                <span className="block text-xs text-gray-500">
                  {[item.product_name, item.size, item.pricing_tier].filter(Boolean).join(" · ")}
                </span>
              </td>
              <td className="py-1 text-right">{item.quantity}</td>
              <td className="py-1 text-right">{Number(item.line_total).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="space-y-1 border-t pt-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-500">Subtotal</dt>
          <dd>{order.subtotal.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Delivery fee</dt>
          <dd>{order.delivery_fee.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Total</dt>
          <dd>KES {order.total.toLocaleString()}</dd>
        </div>
      </dl>

      {canTransition && order.allowed_transitions.length > 0 ? (
        <div className="space-y-2 border-t pt-3">
          <label className="block text-sm">
            <span className="text-gray-700">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Customer called to confirm"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {order.allowed_transitions.map((target) => (
              <button
                key={target}
                type="button"
                onClick={() => void move(target)}
                disabled={busyStatus !== null}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                {busyStatus === target ? "Working..." : `→ ${target.replace(/_/g, " ")}`}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="border-t pt-3 text-xs text-gray-500">
          {canTransition
            ? "No status changes are available for this order."
            : "Your role can view orders but not change their status."}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {order.history.length > 0 && (
        <details className="border-t pt-2 text-sm">
          <summary className="cursor-pointer text-gray-600">Status history</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {order.history.map((entry, index) => (
              <li key={`${entry.created_at}-${index}`}>
                {new Date(entry.created_at).toLocaleString()}: {entry.from ?? "—"} →{" "}
                {entry.to}
                {entry.reason ? ` (${entry.reason})` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}