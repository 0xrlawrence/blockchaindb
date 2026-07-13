import type { AppConfig } from "./types";
import { DEFAULT_NETWORK, findByChainId } from "./networks";

export const DEFAULT_RPC_URL = DEFAULT_NETWORK.rpcUrl; // Polygon Amoy

/* Deploy prompts and hosting dashboards let people paste anything ("test",
 * placeholders, addresses with typos). Malformed values behave as UNSET —
 * the RPC falls back to the default network and the onboarding detector
 * reports what's genuinely missing — instead of crashing every RPC call
 * with errors like `unsupported protocol test`. */
function sanitizeRpcUrl(value: string): string {
  const v = value.trim();
  return /^https?:\/\/[^\s]+$/i.test(v) ? v : "";
}
function sanitizePrivateKey(value: string): string {
  const v = value.trim();
  return /^(0x)?[0-9a-fA-F]{64}$/.test(v)
    ? v.startsWith("0x")
      ? v
      : `0x${v}`
    : "";
}
function sanitizeAddress(value: string): string {
  const v = value.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(v) ? v : "";
}

/** Read config fresh on every call so .env.local edits apply immediately. */
export function getConfig(): AppConfig {
  return {
    rpcUrl: sanitizeRpcUrl(process.env.RPC_URL ?? "") || DEFAULT_RPC_URL,
    privateKey: sanitizePrivateKey(process.env.PRIVATE_KEY ?? ""),
    contractAddress: sanitizeAddress(process.env.CONTRACT_ADDRESS ?? ""),
    apiKey: (process.env.API_KEY ?? "").trim(),
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "").trim(),
    dashboardPassword: (process.env.DASHBOARD_PASSWORD ?? "").trim(),
    dataVisibility:
      (process.env.DATA_VISIBILITY ?? "").trim().toLowerCase() === "public"
        ? "public"
        : "private",
    encryptionKey: (process.env.ENCRYPTION_KEY ?? "").trim(),
  };
}

export function networkName(chainId: number): string {
  return findByChainId(chainId)?.name ?? `EVM Chain ${chainId}`;
}

export function explorerUrl(chainId: number): string | null {
  return findByChainId(chainId)?.explorerUrl ?? null;
}

/* Last write-transaction hash, shared across route bundles via globalThis. */
const g = globalThis as { __blockchaindbLastTx?: string | null };

export function setLastTxHash(hash: string) {
  g.__blockchaindbLastTx = hash;
}

export function getLastTxHash(): string | null {
  return g.__blockchaindbLastTx ?? null;
}
