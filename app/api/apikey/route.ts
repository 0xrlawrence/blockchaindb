import { NextRequest, NextResponse } from "next/server";
import { getApiKey, generateApiKey, requireDashboard } from "@/lib/auth";
import { persistEnv } from "@/lib/env";
import { hydrateSettings } from "@/lib/settingsStore";

export const dynamic = "force-dynamic";

/**
 * Dashboard-only management of the API key. The key is returned in full to the
 * dashboard (same-origin) because the owner needs to copy it into their apps;
 * external callers get a 403.
 */
export async function GET(req: NextRequest) {
  await hydrateSettings();
  const blocked = requireDashboard(req);
  if (blocked) return blocked;
  const key = getApiKey();
  return NextResponse.json({ configured: Boolean(key), apiKey: key || null });
}

/**
 * POST /api/apikey
 * {}                 → generate/rotate the key, returns the new key
 * { "action":"clear" } → remove the key (API becomes open)
 */
export async function POST(req: NextRequest) {
  await hydrateSettings();
  const blocked = requireDashboard(req);
  if (blocked) return blocked;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "clear") {
      await persistEnv({ apiKey: "" });
      return NextResponse.json({ configured: false, apiKey: null });
    }
    const apiKey = generateApiKey();
    await persistEnv({ apiKey });
    return NextResponse.json({ configured: true, apiKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
