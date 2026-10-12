// Safaricom M-Pesa Daraja client (OAuth + STK Push + STK Query).
//
// Secrets read here (Edge Function secrets, never in the browser):
//   MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY,
//   MPESA_BASE_URL (default: sandbox), MPESA_CALLBACK_URL, MPESA_CALLBACK_TOKEN
//
// Never log config values, passwords or tokens from this module.

import { projectUrl } from "./db.ts"

export interface DarajaConfig {
  baseUrl: string
  shortcode: string
  passkey: string
  callbackUrl: string
}

export class MpesaNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MpesaNotConfiguredError"
  }
}

let tokenCache: { token: string; expiresAt: number } | null = null

/** Builds the Daraja config, failing loudly when secrets are missing. */
export function darajaConfig(): DarajaConfig {
  const baseUrl = (Deno.env.get("MPESA_BASE_URL") ?? "https://sandbox.safaricom.co.ke").replace(/\/+$/, "")
  const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY") ?? ""
  const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET") ?? ""
  const shortcode = Deno.env.get("MPESA_SHORTCODE") ?? ""
  const passkey = Deno.env.get("MPESA_PASSKEY") ?? ""
  const callbackToken = Deno.env.get("MPESA_CALLBACK_TOKEN") ?? ""

  if (!consumerKey || !consumerSecret || !shortcode || !passkey) {
    throw new MpesaNotConfiguredError(
      "M-Pesa is not configured (MPESA_CONSUMER_KEY / CONSUMER_SECRET / SHORTCODE / PASSKEY)"
    )
  }
  if (!callbackToken) {
    // Without this secret anyone could POST a forged callback and mark orders paid.
    throw new MpesaNotConfiguredError(
      "MPESA_CALLBACK_TOKEN is not set — callbacks cannot be authenticated without it"
    )
  }

  const callbackUrl = Deno.env.get("MPESA_CALLBACK_URL") ??
    `${projectUrl()}/functions/v1/mpesa-callback?token=${callbackToken}`

  return { baseUrl, shortcode, passkey, callbackUrl }
}

function darajaTimestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
}

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token
  const cfg = darajaConfig()
  const credentials = Deno.env.get("MPESA_CONSUMER_KEY") + ":" + Deno.env.get("MPESA_CONSUMER_SECRET")
  const res = await fetch(`${cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(credentials)}` },
  })
  if (!res.ok) throw new Error(`Daraja OAuth failed (HTTP ${res.status})`)
  const body = (await res.json()) as { access_token?: string; expires_in?: number | string }
  if (!body.access_token) throw new Error("Daraja OAuth response did not include an access token")
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in ?? 3540) * 1000,
  }
  return tokenCache.token
}

export interface StkPushOptions {
  phone: string
  amount: number
  accountReference: string
  transactionDesc: string
}

export interface StkPushResult {
  ok: boolean
  merchantRequestId?: string
  checkoutRequestId?: string
  customerMessage?: string
  error?: string
  /** Daraja's response minus anything sensitive — safe to persist as audit data. */
  raw: Record<string, unknown>
}

export async function stkPush(opts: StkPushOptions): Promise<StkPushResult> {
  const cfg = darajaConfig()
  const amount = Math.round(opts.amount)
  if (!Number.isInteger(amount) || amount < 1) {
    return { ok: false, error: "Amount must be at least KES 1", raw: {} }
  }

  const timestamp = darajaTimestamp()
  const payload = {
    BusinessShortCode: cfg.shortcode,
    Password: btoa(`${cfg.shortcode}${cfg.passkey}${timestamp}`),
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: amount,
    PartyA: opts.phone,
    PartyB: cfg.shortcode,
    PhoneNumber: opts.phone,
    CallBackURL: cfg.callbackUrl,
    AccountReference: opts.accountReference.slice(0, 12),
    TransactionDesc: opts.transactionDesc.slice(0, 13),
  }

  const token = await accessToken()
  const res = await fetch(`${cfg.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>

  const checkoutRequestId = typeof raw.CheckoutRequestID === "string" ? raw.CheckoutRequestID : undefined
  if (!res.ok || raw.ResponseCode !== "0" || !checkoutRequestId) {
    const description = typeof raw.errorMessage === "string"
      ? raw.errorMessage
      : typeof raw.ResponseDescription === "string"
      ? raw.ResponseDescription
      : `Daraja HTTP ${res.status}`
    return { ok: false, error: description, raw }
  }

  return {
    ok: true,
    merchantRequestId: typeof raw.MerchantRequestID === "string" ? raw.MerchantRequestID : undefined,
    checkoutRequestId,
    customerMessage: typeof raw.CustomerMessage === "string" ? raw.CustomerMessage : undefined,
    raw,
  }
}

export interface StkQueryResult {
  ok: boolean
  resultCode: number | null
  resultDesc: string | null
  raw: Record<string, unknown>
}

/**
 * Independent confirmation straight from Daraja (used when
 * MPESA_VERIFY_CALLBACK=1): the callback alone is unauthenticated traffic.
 */
export async function stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
  const cfg = darajaConfig()
  const timestamp = darajaTimestamp()
  const payload = {
    BusinessShortCode: cfg.shortcode,
    Password: btoa(`${cfg.shortcode}${cfg.passkey}${timestamp}`),
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  }

  const token = await accessToken()
  const res = await fetch(`${cfg.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>

  const resultCode = raw.ResultCode === undefined || raw.ResultCode === null
    ? null
    : Number(raw.ResultCode)
  return {
    ok: res.ok && resultCode !== null,
    resultCode: resultCode !== null && Number.isFinite(resultCode) ? resultCode : null,
    resultDesc: typeof raw.ResultDesc === "string" ? raw.ResultDesc : null,
    raw,
  }
}
