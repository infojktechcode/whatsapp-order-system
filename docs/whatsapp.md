# WhatsApp Architecture — WhatsApp Order System

## Layered Design
WhatsApp -> Webhook -> Message Parser -> Conversation State -> {Product, Cart, Checkout, Payment} Services

## Conversation State Machine
BROWSING -> SELECTING_PRODUCT -> SELECTING_VARIANT -> SELECTING_QUANTITY
-> DELIVERY_INFORMATION -> ORDER_REVIEW -> PAYMENT -> CONFIRMATION

## Menu Flow
1. Shop Products | 2. Wholesale | 3. Track Order | 4. Talk to an Agent
Then: Body Mist | Body Lotion | Perfume | Deodorant | ...

## Key Rule
WhatsApp layer MUST use the same backend services as the website.
No separate ordering system.
