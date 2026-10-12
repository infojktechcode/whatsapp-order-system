import { useEffect, useState } from "react"
import { getActiveCounties, getActiveDeliveryMethods } from "../../services/delivery.service.js"
import type { County, DeliveryMethod } from "../../types/index.js"

export function DeliveryForm() {
  const [counties, setCounties] = useState<County[]>([])
  const [methods, setMethods] = useState<DeliveryMethod[]>([])
  const [countyId, setCountyId] = useState("")
  const [methodId, setMethodId] = useState("")
  const [pickup, setPickup] = useState(false)
  const [address, setAddress] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [countyRows, methodRows] = await Promise.all([
          getActiveCounties(),
          getActiveDeliveryMethods(),
        ])
        if (cancelled) return
        setCounties(countyRows as County[])
        setMethods(methodRows as DeliveryMethod[])
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load delivery options")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <div className="p-4 text-gray-500">Loading delivery options...</div>
  if (error) return <div className="p-4 text-red-600">{error}</div>

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Delivery</h1>

      <label className="block text-sm">
        <span className="text-gray-700">County</span>
        <select
          value={countyId}
          onChange={(e) => setCountyId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">Select a county</option>
          {counties.map((county) => (
            <option key={county.id} value={county.id}>
              {county.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-gray-700">Delivery method</span>
        <select
          value={methodId}
          onChange={(e) => {
            setMethodId(e.target.value)
            setPickup(e.target.value !== "courier")
          }}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">Select a method</option>
          {methods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </select>
      </label>

      {pickup ? (
        <label className="block text-sm">
          <span className="text-gray-700">Pickup point / landmark</span>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Kenyatta Avenue stage"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
      ) : (
        <label className="block text-sm">
          <span className="text-gray-700">Delivery address</span>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Building, street, town"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
      )}

      <p className="text-xs text-gray-500">
        Delivery fees are calculated server-side from the delivery_rates table when the order is
        confirmed — they are never taken from this form.
      </p>
    </div>
  )
}
