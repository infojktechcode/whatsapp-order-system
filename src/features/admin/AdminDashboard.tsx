import { useCallback, useEffect, useState } from "react"
import { supabase } from "../../lib/supabase.js"
import {
  adminGetOrder,
  adminListOrders,
  adminMe,
  adminStats,
  signOutAdmin,
  type AdminOrderDetail as OrderDetail,
  type AdminOrderRow,
  type AdminStats,
} from "../../services/admin.service.js"
import { AdminLogin } from "./AdminLogin.js"
import { AdminOrderDetail } from "./AdminOrderDetail.js"

// Staff order management. Everything comes from the `admin` Edge Function —
// this page never queries or writes tables directly, and it only shows the
// transitions the server says are allowed for each order.

interface AdminProfileResponse {
  name: string
  email: string
  role: string
  can_transition: boolean
}

const FILTERS = ["", "awaiting_payment", "confirmed", "processing", "dispatched", "delivered"]

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "cancelled" || status === "payment_failed"
      ? "bg-red-100 text-red-700"
      : status === "delivered" || status === "paid"
        ? "bg-green-100 text-green-700"
        : "bg-gray-100 text-gray-700"
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>
      {status.replace(/_/g, " ")}
    </span>
  )
}

export function AdminDashboard() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [profile, setProfile] = useState<AdminProfileResponse | null>(null)
  const [orders, setOrders] = useState<AdminOrderRow[]>([])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noAccess, setNoAccess] = useState(false)

  // Supabase Auth session decides whether we even try the admin function.
  useEffect(() => {
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSignedIn(Boolean(data.session))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session))
      if (!session) {
        setProfile(null)
        setOrders([])
        setSelected(null)
        setNoAccess(false)
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const load = useCallback(
    async (statusFilter: string) => {
      setLoading(true)
      setError(null)
      try {
        const [rows, summary] = await Promise.all([
          adminListOrders(statusFilter ? { status: statusFilter } : undefined),
          adminStats(),
        ])
        setOrders(rows)
        setStats(summary)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Could not load the dashboard"
        if (/admin access|sign in|session/i.test(message)) setNoAccess(true)
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Confirm the session really belongs to an admin before rendering anything.
  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    void (async () => {
      try {
        const me = await adminMe()
        if (cancelled) return
        setProfile(me)
        setNoAccess(false)
      } catch (e: unknown) {
        if (cancelled) return
        setNoAccess(true)
        setError(e instanceof Error ? e.message : "Could not verify admin access")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn])

  useEffect(() => {
    if (signedIn) void load(filter)
  }, [signedIn, filter, load])

  const openOrder = async (id: string) => {
    setError(null)
    try {
      setSelected(await adminGetOrder(id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load the order")
    }
  }

  if (signedIn === null) return <div className="p-4 text-gray-500">Checking session...</div>

  if (!signedIn) return <AdminLogin onSignedIn={() => setSignedIn(true)} />

  if (noAccess && !profile) {
    return (
      <div className="max-w-md mx-auto p-4 space-y-3">
        <h1 className="text-xl font-bold">Admin</h1>
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {error ?? "This account is signed in but has no active admin_users entry."}
        </p>
        <button
          type="button"
          onClick={() => void signOutAdmin()}
          className="rounded-lg border px-4 py-2 text-sm"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Admin</h1>
          {profile && (
            <p className="text-xs text-gray-500">
              {profile.name} · {profile.role.replace(/_/g, " ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void signOutAdmin()}
          className="rounded-lg border px-3 py-1.5 text-sm"
        >
          Sign out
        </button>
      </header>

      {stats && (
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-gray-500">Orders</p>
            <p className="text-lg font-semibold">{stats.orders_total}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-gray-500">Paid total</p>
            <p className="text-lg font-semibold">{stats.paid_total.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-gray-500">Awaiting payment</p>
            <p className="text-lg font-semibold">
              {stats.orders_by_status.awaiting_payment ?? 0}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-gray-500">Low stock</p>
            <p className="text-lg font-semibold">{stats.low_stock_variants}</p>
          </div>
        </div>
      )}

      <label className="block text-sm">
        <span className="text-gray-700">Filter</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        >
          {FILTERS.map((slug) => (
            <option key={slug || "all"} value={slug}>
              {slug ? slug.replace(/_/g, " ") : "All orders"}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="p-2">Order</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Total</th>
              <th className="p-2">Status</th>
              <th className="p-2">Payment</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="cursor-pointer border-b last:border-0" onClick={() => void openOrder(order.id)}>
                <td className="p-2">
                  {order.order_number}
                  <span className="block text-xs text-gray-500">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                </td>
                <td className="p-2">{order.customer_phone}</td>
                <td className="p-2">{order.total.toLocaleString()}</td>
                <td className="p-2">
                  <StatusPill status={order.status} />
                </td>
                <td className="p-2 text-xs">{order.payment_status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && orders.length === 0 && (
          <p className="p-3 text-sm text-gray-500">No orders match this filter.</p>
        )}
      </div>

      {selected && (
        <AdminOrderDetail
          order={selected}
          canTransition={profile?.can_transition ?? false}
          onChanged={() => {
            void openOrder(selected.id)
            void load(filter)
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}