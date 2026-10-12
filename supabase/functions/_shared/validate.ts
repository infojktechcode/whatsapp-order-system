// Input validation shared by the Edge Functions.
// Pure TypeScript on purpose: no Deno APIs, so the same helpers are exercised
// by the Vitest suite.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PHONE_RE = /^254[17]\d{8}$/

export class ValidationError extends Error {
  readonly field: string

  constructor(field: string, message: string) {
    super(message)
    this.name = "ValidationError"
    this.field = field
  }
}

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new ValidationError(field, `${field} must be a valid UUID`)
  }
  return value.toLowerCase()
}

export function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null
  return requireUuid(value, field)
}

/** Normalises Kenyan MSISDNs to 2547XXXXXXXX / 2541XXXXXXXX. */
export function normalizePhone(value: unknown, field = "phone"): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(field, "A phone number is required")
  }
  const digits = value.replace(/[\s\-().+]/g, "")
  const candidates = [
    digits,
    digits.startsWith("0") ? `254${digits.slice(1)}` : null,
    /^[71]/.test(digits) ? `254${digits}` : null,
  ]
  for (const candidate of candidates) {
    if (candidate && PHONE_RE.test(candidate)) return candidate
  }
  throw new ValidationError(field, "Phone must be a Kenyan number, e.g. 254712345678")
}

export function requireIntInRange(
  value: unknown,
  field: string,
  min: number,
  max: number
): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(field, `${field} must be an integer between ${min} and ${max}`)
  }
  return n
}

export function optionalText(value: unknown, field: string, maxLen: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") {
    throw new ValidationError(field, `${field} must be text`)
  }
  const trimmed = value.trim()
  if (trimmed === "") return null
  if (trimmed.length > maxLen) {
    throw new ValidationError(field, `${field} must be at most ${maxLen} characters`)
  }
  return trimmed
}

export function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  fallback: T
): T {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(field, `${field} must be one of: ${allowed.join(", ")}`)
  }
  return value as T
}

/** Constant-time string comparison (webhook secrets, callback tokens). */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const ab = encoder.encode(a)
  const bb = encoder.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

/** Fields no client may ever send — every amount is computed server-side. */
export const FORBIDDEN_PRICE_FIELDS: ReadonlySet<string> = new Set([
  "delivery_fee",
  "discount",
  "subtotal",
  "total",
  "amount",
  "price",
  "unit_price",
  "line_total",
  "retail_price",
  "wholesale_price",
  "customer_id",
])

/**
 * Rejects any field outside `allowed` — unknown fields fail loudly instead of
 * being silently ignored. Price-like fields get an explicit "computed on the
 * server" error so a future client cannot smuggle amounts through a side door.
 */
export function assertKnownFields(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  prefix = ""
): void {
  for (const key of Object.keys(record)) {
    if (allowed.has(key)) continue
    if (FORBIDDEN_PRICE_FIELDS.has(key)) {
      throw new ValidationError(
        prefix ? `${prefix}.${key}` : key,
        "prices, fees, discounts and totals are computed on the server and must not be sent"
      )
    }
    throw new ValidationError(prefix ? `${prefix}.${key}` : key, `unexpected field: ${key}`)
  }
}
