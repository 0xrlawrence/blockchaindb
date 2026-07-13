import { NextRequest, NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "crypto";
import { getConfig } from "./config";

/**
 * API access control for the data endpoints so StarBoarDB can back an
 * external website.
 *
 * Model:
 *  - CORS is always enabled, so any website can call the API from the browser.
 *  - The dashboard (same-origin requests) is always allowed.
 *  - Cross-origin / server-to-server callers must send the API key IF one is
 *    configured (`API_KEY`). If no key is set, the API is OPEN — fine for local
 *    dev, but set a key before exposing it publicly.
 *
 * Send the key as either header:
 *    x-api-key: <key>
 *    Authorization: Bearer <key>
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

export function corsHeaders(req: NextRequest): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": req.headers.get("origin") ?? "*",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    "Access-Control-Max-Age": "86400",
  };
}

type Handler = (req: NextRequest) => Promise<NextResponse> | NextResponse;

/** Wrap a data-endpoint handler with CORS + optional API-key enforcement. */
export function withApiAuth(handler: Handler): Handler {
  return async (req: NextRequest) => {
    const cors = corsHeaders(req);
    const attach = (res: NextResponse) => {
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    };

    if (!isSameOrigin(req)) {
      const expected = getApiKey();
      if (expected) {
        const provided = providedKey(req);
        if (!provided || !keysMatch(provided, expected)) {
          return attach(
            NextResponse.json(
              {
                error:
                  "Unauthorized. Send your API key as an 'x-api-key' header or 'Authorization: Bearer <key>'.",
              },
              { status: 401 }
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
