import { PaymentForm } from "../payments/PaymentForm.js"
import type { OrderStatusResult } from "../../services/order-status.service.js"

// Pay → confirming → paid | failed | waiting. Every figure shown is what the
// server returned (checkout totals / order-status payment row) — the browser
// never computes or sends amounts.

export type PaymentStage = "pay" | "confirming" | "paid" | "failed" | "waiting"

interface PaymentFlowProps {
  stage: PaymentStage
  orderId: string
  orderNumber: string
  phone: string
  /** Server totals from checkout(), when available (in-session). */
  total: number | null
  /** Latest authoritative status fetched by the orchestrator. */
  paid: OrderStatusResult | null
  failureReason: string | null
  onStkSent: () => void
  onBack: () => void
  onRetry: () => void
  onCheckAgain: () => void
  onDone: () => void
}

export function PaymentFlow({
  stage,
  orderId,
  orderNumber,
  phone,
  total,
  paid,
  failureReason,
  onStkSent,
  onBack,
  onRetry,
  onCheckAgain,
  onDone,
}: PaymentFlowProps) {
  if (stage === "confirming") {
    return (
      <div className="max-w-md mx-auto p-4 space-y-3 text-center">
        <h1 className="text-xl font-bold">Confirming payment</h1>
        <p className="text-sm text-gray-600">
          Check your phone for the M-Pesa prompt and enter your PIN. Waiting for confirmation of
          order {orderNumber}...
        </p>
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#25D366] border-t-transparent" />
      </div>
    )
  }

  if (stage === "paid") {
    const receipt = paid?.payment?.mpesa_receipt_number
    const amount = paid?.total ?? total
    return (
      <div className="max-w-md mx-auto p-4 space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
          ✓
        </div>
        <h1 className="text-xl font-bold text-green-700">Payment received</h1>
        <div className="rounded-lg border bg-gray-50 p-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Order</span>
            <span className="font-medium">{orderNumber}</span>
          </div>
          {receipt && (
            <div className="flex justify-between">
              <span className="text-gray-600">M-Pesa receipt</span>
              <span className="font-medium">{receipt}</span>
            </div>
          )}
          {amount !== null && (
            <div className="flex justify-between">
              <span className="text-gray-600">Amount</span>
              <span className="font-medium">KES {amount.toLocaleString()}</span>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500">
          We will message you when your order is confirmed and on the way.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-lg bg-[#25D366] py-3 text-white"
        >
          Continue shopping
        </button>
      </div>
    )
  }

  if (stage === "failed") {
    return (
      <div className="max-w-md mx-auto p-4 space-y-4 text-center">
        <h1 className="text-xl font-bold text-red-600">Payment not completed</h1>
        <p className="text-sm text-gray-600">
          {failureReason ??
            "M-Pesa did not complete the payment. You can try again — nothing was charged."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="w-full rounded-lg bg-[#25D366] py-3 text-white"
        >
          Try again
        </button>
      </div>
    )
  }

  if (stage === "waiting") {
    return (
      <div className="max-w-md mx-auto p-4 space-y-4 text-center">
        <h1 className="text-xl font-bold">Still waiting for confirmation</h1>
        <p className="text-sm text-gray-600">
          If you completed the M-Pesa prompt, the confirmation usually arrives within a minute.
          Order {orderNumber}
          {total !== null ? ` · KES ${total.toLocaleString()}` : ""}.
        </p>
        <button
          type="button"
          onClick={onCheckAgain}
          className="w-full rounded-lg bg-[#25D366] py-3 text-white"
        >
          Check again
        </button>
        <button type="button" onClick={onRetry} className="w-full rounded-lg border py-3 text-sm">
          Send the prompt again
        </button>
      </div>
    )
  }

  // stage === "pay"
  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Pay with M-Pesa</h1>
      <div className="rounded-lg border bg-gray-50 p-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-600">Order</span>
          <span className="font-medium">{orderNumber}</span>
        </div>
        {total !== null && (
          <div className="flex justify-between">
            <span className="text-gray-600">Total (server-computed)</span>
            <span className="font-medium">KES {total.toLocaleString()}</span>
          </div>
        )}
      </div>

      <PaymentForm orderId={orderId} phone={phone} onSuccess={onStkSent} />

      <button type="button" onClick={onBack} className="w-full text-sm text-gray-500 underline">
        I&apos;ll pay later
      </button>
    </div>
  )
}
