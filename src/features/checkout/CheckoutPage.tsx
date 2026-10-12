import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useCartStore } from "../cart/useCartStore.js"
import { checkout } from "../../services/checkout.service.js"
import { getOrderStatus } from "../../services/order-status.service.js"
import type { OrderStatusResult } from "../../services/order-status.service.js"
import type { CheckoutInput, CheckoutResult } from "../../types/checkout.js"
import type { CartItem } from "../../types/index.js"
import { OrderReview } from "./OrderReview.js"
import { PaymentFlow, type PaymentStage } from "./PaymentFlow.js"
import { useCheckoutStore } from "./useCheckoutStore.js"

type Stage = "review" | PaymentStage

const POLL_INTERVAL_MS = 4000
const MAX_POLLS = 30 // ~2 minutes before falling back to manual checks

/**
 * Mirrors the server rule client-side so wholesale lines get considered:
 * create_order() only applies a wholesale price when customer_type is
 * wholesale AND the line meets its variant threshold — it re-validates both,
 * so a wrong guess here can never produce a wrong price.
 */
function deriveCustomerType(items: CartItem[]): "retail" | "wholesale" {
  const qualifies = items.some(
    (i) => i.variant && i.variant.wholesale_price > 0 && i.quantity >= i.variant.wholesale_threshold
  )
  return qualifies ? "wholesale" : "retail"
}

export function CheckoutPage() {
  const navigate = useNavigate()
  const items = useCartStore((s) => s.items)
  const clearCart = useCartStore((s) => s.clear)
  const { customer, delivery, placed, setPlaced, clearPlaced } = useCheckoutStore()

  const [stage, setStage] = useState<Stage>(() => (placed ? "pay" : "review"))
  const [placing, setPlacing] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckoutResult | null>(null)
  const [paid, setPaid] = useState<OrderStatusResult | null>(null)
  const [failureReason, setFailureReason] = useState<string | null>(null)

  const placeOrder = async () => {
    if (placed) {
      setStage("pay") // order already exists — resume payment instead of duplicating
      return
    }
    if (!delivery || items.length === 0) return

    setPlacing(true)
    setReviewError(null)
    try {
      const input: CheckoutInput = {
        items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        customer: { phone: customer.phone, name: customer.name || null },
        customer_type: deriveCustomerType(items),
        delivery: {
          type: delivery.type,
          county_id: delivery.county_id || null,
          method_id: delivery.method_id || null,
          pickup_point_id: delivery.pickup_point_id || null,
          address: delivery.address || null,
        },
        channel: "web",
      }
      const res = await checkout(input)
      setResult(res)
      setPlaced({
        order_id: res.order_id,
        order_number: res.order_number,
        status_token: res.status_token,
      })
      setStage("pay")
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "Order could not be created")
    } finally {
      setPlacing(false)
    }
  }

  // Poll the authoritative status until the Daraja callback settles the order.
  useEffect(() => {
    if (stage !== "confirming" || !placed) return
    let cancelled = false
    let inFlight = false
    let attempts = 0

    const check = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      attempts += 1
      try {
        const status = await getOrderStatus(placed.order_id, placed.status_token)
        if (cancelled) return
        setPaid(status)

        const payStatus = status.payment?.status
        if (status.status === "paid" || payStatus === "completed") {
          clearCart()
          setStage("paid")
          return
        }
        if (payStatus === "failed") {
          setFailureReason(status.payment?.result_description ?? null)
          setStage("failed")
          return
        }
        if (attempts >= MAX_POLLS) setStage("waiting")
      } catch {
        if (cancelled) return
        // Transient network errors keep polling until the budget runs out.
        if (attempts >= MAX_POLLS) setStage("waiting")
      } finally {
        inFlight = false
      }
    }

    void check()
    const timer = setInterval(() => void check(), POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [stage, placed, clearCart])

  if (stage === "review" || !placed) {
    return <OrderReview busy={placing} error={reviewError} onPlaceOrder={placeOrder} />
  }

  return (
    <PaymentFlow
      stage={stage as PaymentStage}
      orderId={placed.order_id}
      orderNumber={placed.order_number}
      phone={customer.phone}
      total={result?.total ?? null}
      paid={paid}
      failureReason={failureReason}
      onStkSent={() => setStage("confirming")}
      onBack={() => setStage("review")}
      onRetry={() => {
        setFailureReason(null)
        setStage("pay")
      }}
      onCheckAgain={() => setStage("confirming")}
      onDone={() => {
        clearPlaced()
        setResult(null)
        setPaid(null)
        navigate("/")
      }}
    />
  )
}
