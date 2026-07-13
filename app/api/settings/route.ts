import { NextRequest, NextResponse } from "next/server";
import { accessSync, constants } from "fs";
import { getConfig, DEFAULT_RPC_URL } from "@/lib/config";
import { persistEnv } from "@/lib/env";
import { requireDashboard } from "@/lib/auth";
import { hydrateSettings } from "@/lib/settingsStore";

/** Can this host persist .env.local? (false on Vercel/Netlify, where
 *  dashboard-managed settings fall back to the on-chain store) */
function hostWritable(): boolean {
  try {
    accessSync(process.cwd(), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";

/** GET /api/settings — current values; the private key is only reported as set/unset. */
export async function GET(req: NextRequest) {
  await hydrateSettings();
  const blocked = requireDashboard(req);
  if (blocked) return blocked;
  const config = getConfig();
  return NextResponse.json({
    hostWritable: hostWritable(),
    rpcUrl: config.rpcUrl,
    contractAddress: config.contractAddress,
    privateKeySet: Boolean(config.privateKey),
    allowedOrigins: config.allowedOrigins,
    dataVisibility: config.dataVisibility,
    encryptionKeySet: Boolean(config.encryptionKey),
    defaultRpcUrl: DEFAULT_RPC_URL,
  });
}

/**
 * POST /api/settings
 * { "rpcUrl"?: string, "privateKey"?: string, "contractAddress"?: string,
 *   "allowedOrigins"?: string }
 * Persists to .env.local; omitted fields keep their current value,
 * empty strings clear the value. `allowedOrigins` is a comma/newline
 * separated list of origins (https://app.example.com, https://*.example.com);
 * empty means any site may call the data API.
 */
export async function POST(req: NextRequest) {
  await hydrateSettings();
  const blocked = requireDashboard(req);
  if (blocked) return blocked;
  try {
    const body = await req.json();
    const rpcUrl = typeof body?.rpcUrl === "string" ? body.rpcUrl : undefined;
    const privateKey =
      typeof body?.privateKey === "string" ? body.privateKey : undefined;
    const contractAddress =
      typeof body?.contractAddress === "string"
        ? body.contractAddress
        : undefined;
    let allowedOrigins: string | undefined =
      typeof body?.allowedOrigins === "string"
        ? body.allowedOrigins
        : undefined;

    if (allowedOrigins?.trim()) {
      const entries = allowedOrigins
        .split(/[\s,]+/)
        .map((o) => o.trim().replace(/\/+$/, ""))
        .filter(Boolean);
      const bad = entries.find(
        (o) => !/^https?:\/\/(\*\.)?[a-z0-9.-]+(:\d+)?$/i.test(o)
      );
      if (bad) {
        return NextResponse.json(
          {
            error: `\`allowedOrigins\`: "${bad}" is not a valid origin. Use e.g. https://app.example.com or https://*.example.com (no paths).`,
          },
          { status: 400 }
        );
      }
      allowedOrigins = entries.join(",");
    }

    const dataVisibility =
      typeof body?.dataVisibility === "string"
        ? body.dataVisibility.trim().toLowerCase()
        : undefined;
    if (
      dataVisibility !== undefined &&
      dataVisibility !== "public" &&
      dataVisibility !== "private"
    ) {
      return NextResponse.json(
        { error: "`dataVisibility` must be 'public' or 'private'." },
        { status: 400 }
      );
    }

    const encryptionKey =
      typeof body?.encryptionKey === "string"
        ? body.encryptionKey
        : undefined;
    if (encryptionKey?.trim() && encryptionKey.trim().length < 16) {
      return NextResponse.json(
        {
          error:
            "`encryptionKey` must be at least 16 characters — generate one with `openssl rand -hex 32`.",
        },
        { status: 400 }
      );
    }

    if (
      contractAddress?.trim() &&
      !/^0x[0-9a-fA-F]{40}$/.test(contractAddress.trim())
    ) {
      return NextResponse.json(
        { error: "`contractAddress` must be a 0x-prefixed 40-hex-char address" },
        { status: 400 }
      );
    }
    if (
      privateKey?.trim() &&
      !/^(0x)?[0-9a-fA-F]{64}$/.test(privateKey.trim())
    ) {
      return NextResponse.json(
        { error: "`privateKey` must be a 64-hex-char key (0x prefix optional)" },
        { status: 400 }
      );
    }
    if (rpcUrl?.trim() && !/^https?:\/\/[^\s]+$/.test(rpcUrl.trim())) {
      return NextResponse.json(
        { error: "`rpcUrl` must be an http(s) URL with no spaces" },
        { status: 400 }
      );
    }

    await persistEnv({
      rpcUrl,
      privateKey,
      contractAddress,
      allowedOrigins,
      dataVisibility,
      encryptionKey,
    });
    return NextResponse.json({ saved: true, path: ".env.local" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
