# Database Architecture — WhatsApp Order System

## Tables (27)
- Scents, product_types, counties, delivery_methods, customer_types, order_statuses
- Products, product_variants, product_images, pricing_tiers, inventory
- Customers, customer_addresses
- Pickup_points, delivery_rates
- Business_settings, wholesale_settings
- Orders, order_items, order_status_history
- Payments, payment_transactions
- Audit_logs
- Admin_users
- Whatsapp_conversations, whatsapp_messages

## Keys & Constraints
- UUID primary keys everywhere
- Foreign-key constraints on all relationships
- CHECK constraints on prices, quantities, statuses, phone numbers
- UNIQUE constraints on SKUs, order_number, conversation_id, phone_number

## Indexes
36 indexes on frequently queried fields (slug, active, foreign keys, created_at)

## RLS (Row Level Security)
- 23 policies; customers only access their own profile/addresses/orders/payments
- Public read-only on active catalogue
- Admin-only access to management tables via admin_users

## Status Transition Guard
	ransition_order_status() enforces backend-controlled transitions; invalid transitions raise.
