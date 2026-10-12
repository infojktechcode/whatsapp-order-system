import { useState } from 'react'
import { initiateStkPush } from '../../services/payment.service.js'

interface PaymentFormProps {
  orderId: string
  onSuccess: () => void
}

export function PaymentForm({ orderId, onSuccess }: PaymentFormProps) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePay = async () => {
    setLoading(true)
    setError(null)
    try {
      // No amount is passed: the server reads the order total and returns it.
      const result = await initiateStkPush(orderId, phone)
      if (result.status === 'requested') {
        onSuccess()
      } else if (result.status === 'already_requested') {
        setError('An M-Pesa prompt was already sent to your phone. Check your handset.')
      } else {
        setError(result.message ?? 'Payment request failed. Please try again.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
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
        {loading ? 'Sending...' : 'Send M-Pesa prompt'}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  )
}
