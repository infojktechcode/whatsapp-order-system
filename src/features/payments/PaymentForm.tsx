import { useState } from "react"
import { initiateStkPush } from "../../services/payment.service.js"

export function PaymentForm({
  orderId,
  amount,
  onSuccess,
}: {
  orderId: string
  amount: number
  onSuccess: () => void
}) {
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePay = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await initiateStkPush(orderId, phone, amount)
      if (result.status === "requested") {
        onSuccess()
      } else if (result.status === "already_requested") {
        setError("STK already sent. Check your phone.")
      } else {
        setError("Payment request failed")
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Payment failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-bold">M-Pesa Payment</h2>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="254XXXXXXXXX"
        className="w-full rounded-lg border border-gray-300 px-3 py-2"
      />
      <button
        type="button"
        onClick={handlePay}
        disabled={loading || !phone}
        className="w-full rounded-lg bg-green-600 text-white py-2 disabled:opacity-50"
      >
        {loading ? "Sending..." : `Pay KES ${amount.toLocaleString()}`}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  )
}
