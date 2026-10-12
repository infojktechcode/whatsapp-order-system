import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase.js"
import type { Order } from "../../types/index.js"

export function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error: queryError } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
      if (cancelled) return
      if (queryError) {
        // Expected for the public anon key: orders are protected by RLS and
        // admin access is gated by admin_users (Edge Function / signed-in role).
        setError(queryError.message)
      } else if (data) {
        setOrders(data as Order[])
      }
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <div className="p-4">Loading admin...</div>

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Admin - Orders</h1>
      {error && (
        <p className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {error} — order data is RLS-protected; an admin session or Edge Function is required.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">Order</th>
            <th className="p-2 text-left">Total</th>
            <th className="p-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t">
              <td className="p-2">{order.order_number}</td>
              <td className="p-2">KES {order.total.toLocaleString()}</td>
              <td className="p-2">{order.status_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && !error && <p className="text-gray-500 text-sm">No orders yet.</p>}
    </div>
  )
}
