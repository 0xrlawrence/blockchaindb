import path from "path";
import { getConfig } from "./config";
import { writeEnvFile } from "./envfile.mjs";
import { writeChainSettings, type ChainSettingKey } from "./settingsStore";

const ENV_PATH = path.join(process.cwd(), ".env.local");

/**
 * Persist connection settings and apply them to the running process
 * immediately. Omitted fields keep their current value; empty strings clear
 * the value.
 *
 * On a writable host everything goes to `.env.local` (comments and unrelated
 * variables preserved — see envfile.mjs). On a read-only host (Vercel,
 * Netlify) the dashboard-managed settings — password, allowed domains, data
 * visibility, api key — fall back to the encrypted on-chain settings store;
 * only the chain-bootstrap secrets (RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS,
 * ENCRYPTION_KEY) still require hosting environment variables there.
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
}): Promise<void> {
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

    // Read-only host. Bootstrap secrets can only live in hosting env vars…
    const bootstrapChanged: string[] = [];
    if (next.rpcUrl !== undefined && rpcUrl !== current.rpcUrl)
      bootstrapChanged.push("RPC_URL");
    if (next.privateKey !== undefined && privateKey !== current.privateKey)
      bootstrapChanged.push("PRIVATE_KEY");
    if (
      next.contractAddress !== undefined &&
      contractAddress !== current.contractAddress
    )
      bootstrapChanged.push("CONTRACT_ADDRESS");
    if (
      next.encryptionKey !== undefined &&
      encryptionKey !== current.encryptionKey
    )
      bootstrapChanged.push("ENCRYPTION_KEY");
    if (bootstrapChanged.length > 0) {
      throw new Error(
        `This host has a read-only filesystem (e.g. Vercel/Netlify), so ${bootstrapChanged.join(
          " / "
        )} can't be saved from the dashboard here. Set ${bootstrapChanged.length === 1 ? "it" : "them"} as environment variables in your hosting dashboard, then redeploy.`
      );
    }

    // …while dashboard-managed settings go to the on-chain store.
    const chainPartial: Partial<Record<ChainSettingKey, string>> = {};
    if (next.dashboardPassword !== undefined)
      chainPartial.DASHBOARD_PASSWORD = dashboardPassword;
    if (next.allowedOrigins !== undefined)
      chainPartial.ALLOWED_ORIGINS = allowedOrigins;
    if (next.dataVisibility !== undefined)
      chainPartial.DATA_VISIBILITY = dataVisibility;
    if (next.apiKey !== undefined) chainPartial.API_KEY = apiKey;

    if (Object.keys(chainPartial).length > 0) {
      await writeChainSettings(chainPartial);
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
}
