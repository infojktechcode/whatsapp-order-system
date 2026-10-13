// Shared HTTP helpers for the Dear Body Edge Functions.

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

export function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
  })
}

/** Answers the browser preflight; returns null for every other request. */
export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  return null
}

export function methodNotAllowed(allowed: string[]): Response {
  return json({ error: `Method not allowed (use ${allowed.join("/")})` }, 405)
}

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")
  if (!forwarded) return null
  return forwarded.split(",")[0]?.trim() || null
}
