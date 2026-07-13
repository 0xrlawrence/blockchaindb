import { NextRequest, NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "crypto";
import { getConfig } from "./config";

/**
 * API access control for the data endpoints so StarBoarDB can back an
 * external website — Firebase-style: domain whitelist + secret handshake.
 *
 * Model:
 *  - The dashboard (same-origin requests) is always allowed.
 *  - Nothing configured (no `API_KEY`, no `ALLOWED_ORIGINS`): the API is
 *    OPEN with permissive CORS — fine for local dev only.
 *  - Once either is configured, an external request must pass at least one:
 *      1. Domain whitelist — its Origin/Referer matches `ALLOWED_ORIGINS`
 *         (comma-separated origins; `https://*.example.com` wildcards work).
 *         CORS headers echo only whitelisted origins, so browsers on other
 *         sites can't read responses at all.
 *      2. Secret key — `x-api-key: <key>` or `Authorization: Bearer <key>`
 *         matching `API_KEY` (for servers/terminals, where Origin is absent
 *         or forgeable).
 *  - A Postman/terminal caller has no browser Origin and no key → rejected
 *    before any RPC call spends gas.
 *
 * Note: only the key is cryptographic proof — a non-browser client can fake
 * an Origin header. The whitelist is the browser-facing layer (like
 * Firebase's authorized domains); keep a key set for real isolation.
 */

export function getApiKey(): string {
  return getConfig().apiKey;
}

export function apiKeyConfigured(): boolean {
  return getApiKey().length > 0;
}

export function generateApiKey(): string {
  return "bdb_" + randomBytes(24).toString("hex");
}

function providedKey(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  const x = req.headers.get("x-api-key");
  return x ? x.trim() : null;
}

function keysMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Requests the browser marks as same-origin come from our own dashboard.
 *  `Sec-Fetch-Site` is a Forbidden header — page scripts can't spoof it. */
function isSameOrigin(req: NextRequest): boolean {
  return req.headers.get("sec-fetch-site") === "same-origin";
}

/** Whitelisted origins, normalized (lowercase, no trailing slash). */
export function getAllowedOrigins(): string[] {
  return getConfig()
    .allowedOrigins.split(/[\s,]+/)
    .map((o) => o.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean);
}

/** Where the browser says the request came from: Origin, else Referer's origin. */
function requestOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/** Does the request's origin match an ALLOWED_ORIGINS entry?
 *  Exact origin match, plus `https://*.example.com` subdomain wildcards.
 *  Returns false when no whitelist is configured — callers decide the
 *  open-mode default themselves. */
function originWhitelisted(req: NextRequest): boolean {
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return false;
  const raw = requestOrigin(req);
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw.toLowerCase());
  } catch {
    return false;
  }
  const origin = url.origin;
  return allowed.some((entry) => {
    const star = entry.indexOf("://*.");
    if (star !== -1) {
      const proto = entry.slice(0, star + 3); // "https://"
      const host = entry.slice(star + 5); // "example.com"
      return (
        origin.startsWith(proto) &&
        (url.hostname === host || url.hostname.endsWith(`.${host}`))
      );
    }
    return entry === origin;
  });
}

export function corsHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    "Access-Control-Max-Age": "86400",
  };
  const origin = req.headers.get("origin");
  if (getAllowedOrigins().length === 0) {
    // no whitelist: permissive CORS, as before
    headers["Access-Control-Allow-Origin"] = origin ?? "*";
  } else if (origin && originWhitelisted(req)) {
    // whitelist: echo the origin back only when it's allowed — browsers on
    // any other site can't read the response
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

type Handler = (req: NextRequest) => Promise<NextResponse> | NextResponse;

/** Wrap a data-endpoint handler with the security layer:
 *  CORS + (domain whitelist OR API key) enforcement. */
export function withApiAuth(handler: Handler): Handler {
  return async (req: NextRequest) => {
    const cors = corsHeaders(req);
    const attach = (res: NextResponse) => {
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    };

    if (!isSameOrigin(req)) {
      const expected = getApiKey();
      const hasKeyRule = expected.length > 0;
      const hasDomainRule = getAllowedOrigins().length > 0;

      // Anything configured → the request must pass at least one rule.
      if (hasKeyRule || hasDomainRule) {
        const provided = providedKey(req);
        const keyOk =
          hasKeyRule && provided !== null && keysMatch(provided, expected);
        const domainOk = hasDomainRule && originWhitelisted(req);

        if (!keyOk && !domainOk) {
          return attach(
            NextResponse.json(
              {
                error:
                  "Access denied: request origin is not an allowed domain and no valid API key was provided. Call from a whitelisted domain, or send 'x-api-key: <key>' / 'Authorization: Bearer <key>'.",
              },
              { status: 403 }
            )
          );
        }
      }
    }

    return attach(await handler(req));
  };
}

/** CORS preflight response for OPTIONS. */
export function apiOptions(req: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

/** Guard admin-only endpoints (settings, deploy, api-key) to the dashboard. */
export function requireDashboard(req: NextRequest): NextResponse | null {
  if (isSameOrigin(req)) return null;
  return NextResponse.json(
    { error: "This endpoint is only available from the dashboard." },
    { status: 403 }
  );
}
