import path from "path";
import { getConfig } from "./config";
import { writeEnvFile } from "./envfile.mjs";
import { writeChainSettings, type ChainSettingKey } from "./settingsStore";
import { canManageHostEnv, upsertHostEnv, hostEnvHint } from "./hostEnv";

const ENV_PATH = path.join(process.cwd(), ".env.local");

/**
 * Persist connection settings and apply them to the running process
 * immediately. Omitted fields keep their current value; empty strings clear
 * the value.
 *
 * On a writable host everything goes to `.env.local` (comments and unrelated
 * variables preserved — see envfile.mjs). On a read-only host (Vercel,
 * Netlify) the dashboard-managed settings — password, allowed domains, data
 * visibility, api key — fall back to the encrypted on-chain settings store,
 * and the chain-bootstrap secrets (RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS,
 * ENCRYPTION_KEY) go through the hosting provider's own env API when a
 * provider token is configured (see hostEnv.ts) — otherwise they report a
 * clear per-key message pointing at the hosting dashboard.
 *
 * Returns an optional human-readable note about where the values went.
 */
export async function persistEnv(next: {
  rpcUrl?: string;
  privateKey?: string;
  contractAddress?: string;
  apiKey?: string;
  allowedOrigins?: string;
  dashboardPassword?: string;
  dataVisibility?: string;
  encryptionKey?: string;
}): Promise<{ note: string | null }> {
  const current = getConfig();
  const rpcUrl = next.rpcUrl !== undefined ? next.rpcUrl.trim() : current.rpcUrl;
  const privateKey =
    next.privateKey !== undefined ? next.privateKey.trim() : current.privateKey;
  const contractAddress =
    next.contractAddress !== undefined
      ? next.contractAddress.trim()
      : current.contractAddress;
  const apiKey =
    next.apiKey !== undefined ? next.apiKey.trim() : current.apiKey;
  const allowedOrigins =
    next.allowedOrigins !== undefined
      ? next.allowedOrigins.trim()
      : current.allowedOrigins;
  const dashboardPassword =
    next.dashboardPassword !== undefined
      ? next.dashboardPassword.trim()
      : current.dashboardPassword;
  const dataVisibility =
    next.dataVisibility !== undefined
      ? next.dataVisibility.trim().toLowerCase()
      : current.dataVisibility;
  const encryptionKey =
    next.encryptionKey !== undefined
      ? next.encryptionKey.trim()
      : current.encryptionKey;

  let note: string | null = null;

  try {
    writeEnvFile(ENV_PATH, {
      RPC_URL: rpcUrl,
      PRIVATE_KEY: privateKey,
      CONTRACT_ADDRESS: contractAddress,
      API_KEY: apiKey,
      ALLOWED_ORIGINS: allowedOrigins,
      DASHBOARD_PASSWORD: dashboardPassword,
      DATA_VISIBILITY: dataVisibility,
      ENCRYPTION_KEY: encryptionKey,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "EROFS" && code !== "EACCES" && code !== "EPERM") throw error;

    // Read-only host. Bootstrap secrets go through the hosting provider's
    // env API when a token is configured…
    const bootstrapChanged: Record<string, string> = {};
    if (next.rpcUrl !== undefined && rpcUrl !== current.rpcUrl)
      bootstrapChanged.RPC_URL = rpcUrl;
    if (next.privateKey !== undefined && privateKey !== current.privateKey)
      bootstrapChanged.PRIVATE_KEY = privateKey;
    if (
      next.contractAddress !== undefined &&
      contractAddress !== current.contractAddress
    )
      bootstrapChanged.CONTRACT_ADDRESS = contractAddress;
    if (
      next.encryptionKey !== undefined &&
      encryptionKey !== current.encryptionKey
    )
      bootstrapChanged.ENCRYPTION_KEY = encryptionKey;

    if (Object.keys(bootstrapChanged).length > 0) {
      if (canManageHostEnv()) {
        const result = await upsertHostEnv(bootstrapChanged);
        note = result.note;
      } else {
        const keys = Object.keys(bootstrapChanged).join(" / ");
        throw new Error(
          `This host has a read-only filesystem (e.g. Vercel/Netlify), so ${keys} can't be saved from the dashboard here. Either set ${Object.keys(bootstrapChanged).length === 1 ? "it" : "them"} in your hosting dashboard, or ${hostEnvHint()}.`
        );
      }
    }

    // …while dashboard-managed settings go to the on-chain store, with the
    // provider env API as a fallback when the chain isn't bootstrapped yet.
    const chainPartial: Partial<Record<ChainSettingKey, string>> = {};
    if (next.dashboardPassword !== undefined)
      chainPartial.DASHBOARD_PASSWORD = dashboardPassword;
    if (next.allowedOrigins !== undefined)
      chainPartial.ALLOWED_ORIGINS = allowedOrigins;
    if (next.dataVisibility !== undefined)
      chainPartial.DATA_VISIBILITY = dataVisibility;
    if (next.apiKey !== undefined) chainPartial.API_KEY = apiKey;

    if (Object.keys(chainPartial).length > 0) {
      try {
        await writeChainSettings(chainPartial);
      } catch (chainError) {
        if (!canManageHostEnv()) throw chainError;
        const result = await upsertHostEnv(
          chainPartial as Record<string, string>
        );
        note = note ?? result.note;
      }
    }
  }

  process.env.RPC_URL = rpcUrl;
  process.env.PRIVATE_KEY = privateKey;
  process.env.CONTRACT_ADDRESS = contractAddress;
  process.env.API_KEY = apiKey;
  process.env.ALLOWED_ORIGINS = allowedOrigins;
  process.env.DASHBOARD_PASSWORD = dashboardPassword;
  process.env.DATA_VISIBILITY = dataVisibility;
  process.env.ENCRYPTION_KEY = encryptionKey;

  return { note };
}
