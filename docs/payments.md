# Payments — WhatsApp Order System

## Flow
Customer confirms order
    -> Backend calculates final total
    -> Create pending order
    -> Initiate STK Push
    -> Customer enters M-Pesa PIN
    -> Safaricom processes payment
    -> Callback reaches backend
    -> Validate callback
    -> Verify transaction
    -> Update payment
    -> Update order
    -> Send confirmation

## Important Rules
- STK success = PAYMENT_REQUESTED only, NOT PAID.
- Callback determines whether payment actually succeeded.
- Idempotency: same callback must not duplicate payment or order processing.
- Never mark order PAID merely because STK request succeeded.
- Payment audit trail in payment_transactions.

## Callback Validation Checklist
- callback validation, idempotency, transaction reference, amount verification,
  order verification, phone-number verification where appropriate,
  duplicate callback protection, payment audit trail.
