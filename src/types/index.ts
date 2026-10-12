// Shared TypeScript types for the WhatsApp Order System.
// These are the contract between the frontend and backend services.

export type OrderStatus =
    | 'draft'
    | 'pending_checkout'
    | 'awaiting_payment'
    | 'payment_processing'
    | 'paid'
    | 'confirmed'
    | 'processing'
    | 'ready_for_dispatch'
    | 'dispatched'
    | 'delivered'
    | 'payment_failed'
    | 'cancelled'
    | 'refunded';

export type PaymentStatus =
    | 'pending'
    | 'requested'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'refunded';

export type CustomerType = 'retail' | 'wholesale';

export type DeliveryType = 'pickup' | 'courier' | 'bus';

export type OrderChannel = 'web' | 'whatsapp' | 'phone' | 'agent';

export type WhatsAppStep =
    | 'BROWSING'
    | 'SELECTING_PRODUCT'
    | 'SELECTING_VARIANT'
    | 'SELECTING_QUANTITY'
    | 'DELIVERY_INFORMATION'
    | 'ORDER_REVIEW'
    | 'PAYMENT'
    | 'CONFIRMATION';

export interface Scents {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    active: boolean;
}

export interface ProductType {
    id: string;
    name: string;
    slug: string;
    category: string | null;
    active: boolean;
}

export interface Product {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    active: boolean;
    is_demo: boolean;
    demo_price_note: string | null;
}

export interface ProductVariant {
    id: string;
    product_id: string;
    product_type_id: string;
    scent_id: string;
    size: string;
    sku: string;
    barcode: string | null;
    retail_price: number;
    wholesale_price: number;
    wholesale_threshold: number;
    stock_quantity: number;
    low_stock_threshold: number;
    active: boolean;
    metadata: Record<string, unknown>;
    scent?: Scents;
    product_type?: ProductType;
    product?: Product;
}

// A product joined with its variants (and each variant's scent + product type),
// as returned by product.service fetchActiveProducts().
export type ProductWithVariants = Product & { variants: ProductVariant[] };

export interface PricingTier {
    id: string;
    variant_id: string;
    customer_type_id: string;
    minimum_quantity: number;
    maximum_quantity: number | null;
    price: number;
    active: boolean;
}

export interface Inventory {
    id: string;
    variant_id: string;
    quantity_on_hand: number;
    reserved_quantity: number;
    version: number;
}

export interface Customer {
    id: string;
    auth_user_id: string | null;
    name: string;
    phone: string;
    email: string | null;
    customer_type_id: string | null;
    is_wholesale: boolean;
    is_active: boolean;
}

export interface County {
    id: string;
    name: string;
    slug: string;
    region: string | null;
    active: boolean;
}

export interface DeliveryMethod {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    active: boolean;
}

export interface PickupPoint {
    id: string;
    name: string;
    slug: string;
    county_id: string;
    delivery_method_id: string;
    address: string | null;
    landmark: string | null;
    active: boolean;
}

export interface DeliveryRate {
    id: string;
    county_id: string;
    delivery_method_id: string;
    pickup_point_id: string | null;
    fee: number;
    estimated_delivery_time: string | null;
    minimum_order_total: number;
    active: boolean;
}

export interface Order {
    id: string;
    order_number: string;
    customer_id: string;
    status_id: string;
    channel: OrderChannel;
    delivery_type: DeliveryType;
    delivery_county_id: string | null;
    delivery_method_id: string | null;
    pickup_point_id: string | null;
    delivery_address: Record<string, unknown> | null;
    delivery_fee: number;
    subtotal: number;
    discount: number;
    total: number;
    customer_notes: string | null;
    internal_notes: string | null;
    expires_at: string | null;
    paid_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface OrderItem {
    id: string;
    order_id: string;
    variant_id: string;
    quantity: number;
    unit_price: number;
    pricing_tier: string | null;
    line_total: number;
}

export interface Payment {
    id: string;
    order_id: string;
    status: PaymentStatus;
    amount: number;
    currency: string;
    method: string;
    merchant_request_id: string | null;
    checkout_request_id: string | null;
    mpesa_receipt_number: string | null;
    transaction_date: string | null;
    phone_number: string | null;
    result_code: string | null;
    result_description: string | null;
}

export interface PaymentTransaction {
    id: string;
    payment_id: string;
    order_id: string;
    transaction_type: string;
    checkout_request_id: string | null;
    merchant_request_id: string | null;
    mpesa_receipt_number: string | null;
    amount: number | null;
    phone_number: string | null;
    result_code: string | null;
    result_description: string | null;
    raw_payload: Record<string, unknown>;
    processed: boolean;
    signature_valid: boolean | null;
}

export interface CartItem {
    variant_id: string;
    quantity: number;
    unit_price: number;
    pricing_tier: string | null;
    line_total: number;
    product?: Product;
    variant?: ProductVariant;
}

export interface CheckoutCalculation {
    subtotal: number;
    discount: number;
    delivery_fee: number;
    total: number;
    items: CartItem[];
}

export interface StkPushRequest {
    checkout_request_id: string;
    merchant_request_id: string;
    customer_phone: string;
    amount: number;
    order_id: string;
}

export interface DarajaCallback {
    Body: {
        stkCallback: {
            MerchantRequestID: string;
            CheckoutRequestID: string;
            ResultCode: string;
            ResultDesc: string;
            CallbackMetadata: {
                Item: Array<{
                    Name: string;
                    Value: string;
                }>;
            };
        };
    };
}
