import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  getActiveCounties,
  getActiveDeliveryMethods,
  getPickupPoints,
} from "../../services/delivery.service.js"
import { looksLikeKenyanPhone, useCheckoutStore } from "../checkout/useCheckoutStore.js"
import type { County, DeliveryMethod, DeliveryType, PickupPoint } from "../../types/index.js"

const DELIVERY_TYPES: DeliveryType[] = ["pickup", "courier", "bus"]

export function DeliveryForm() {
  const navigate = useNavigate()
  const { customer, delivery, setCustomer, setDelivery } = useCheckoutStore()

  const [counties, setCounties] = useState<County[]>([])
  const [methods, setMethods] = useState<DeliveryMethod[]>([])
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([])
  const [countyId, setCountyId] = useState(delivery?.county_id ?? "")
  const [methodId, setMethodId] = useState(delivery?.method_id ?? "")
  const [pickupPointId, setPickupPointId] = useState(delivery?.pickup_point_id ?? "")
  const [address, setAddress] = useState(delivery?.address ?? "")
  const [name, setName] = useState(customer.name)
  const [phone, setPhone] = useState(customer.phone)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Which delivery type the chosen method slug maps to (pickup/courier/bus).
  const method = methods.find((m) => m.id === methodId)
  const type: DeliveryType | null =
    method && DELIVERY_TYPES.includes(method.slug as DeliveryType)
      ? (method.slug as DeliveryType)
      : null

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
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : "Failed to load delivery options")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Pickup points follow the county; reset when the county changes.
  useEffect(() => {
    if (type !== "pickup" || !countyId) {
      setPickupPoints([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const rows = (await getPickupPoints(countyId)) as PickupPoint[]
        if (!cancelled) {
          setPickupPoints(rows.filter((p) => p.delivery_method_id === methodId))
        }
      } catch {
        if (!cancelled) setPickupPoints([]) // points are optional; fee falls back server-side
      }
    })()
    return () => {
      cancelled = true
    }
  }, [type, countyId, methodId])

  const handleSave = () => {
    setError(null)
    if (!type) {
      setError("Choose a delivery method")
      return
    }
    if (!looksLikeKenyanPhone(phone)) {
      setError("Enter a Kenyan phone number, e.g. 0712345678")
      return
    }
    if (type === "courier" && !address.trim()) {
      setError("Enter the delivery address")
      return
    }

    setSaving(true)
    setCustomer({ name: name.trim(), phone: phone.trim() })
    setDelivery({
      type,
      county_id: countyId,
      county_name: counties.find((c) => c.id === countyId)?.name ?? "",
      method_id: methodId,
      pickup_point_id: type === "pickup" && pickupPointId ? pickupPointId : null,
      address: address.trim(),
    })
    navigate("/checkout")
  }

  if (loading) return <div className="p-4 text-gray-500">Loading delivery options...</div>
  if (loadError) return <div className="p-4 text-red-600">{loadError}</div>

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Delivery</h1>

      <label className="block text-sm">
        <span className="text-gray-700">County</span>
        <select
          value={countyId}
          onChange={(e) => {
            setCountyId(e.target.value)
            setPickupPointId("")
          }}
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
            setPickupPointId("")
          }}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">Select a method</option>
          {methods
            .filter((m) => DELIVERY_TYPES.includes(m.slug as DeliveryType))
            .map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
        </select>
      </label>

      {type === "pickup" && pickupPoints.length > 0 && (
        <label className="block text-sm">
          <span className="text-gray-700">Pickup point (optional)</span>
          <select
            value={pickupPointId}
            onChange={(e) => setPickupPointId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="">No preference</option>
            {pickupPoints.map((point) => (
              <option key={point.id} value={point.id}>
                {point.name}
                {point.landmark ? ` — ${point.landmark}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-sm">
        <span className="text-gray-700">
          {type === "pickup" ? "Pickup landmark (optional)" : "Delivery address"}
        </span>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={
            type === "pickup" ? "e.g. Kenyatta Avenue stage" : "Building, street, town"
          }
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
        <p className="text-sm font-medium text-gray-700">Your details</p>
        <label className="block text-sm">
          <span className="text-gray-700">Name (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jane Wanjiku"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">M-Pesa phone number</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0712345678"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
      </div>

      <p className="text-xs text-gray-500">
        Delivery fees are calculated server-side from the delivery_rates table when the order is
        placed — they are never taken from this form.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-[#25D366] py-3 text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Continue to checkout"}
      </button>
    </div>
  )
}
