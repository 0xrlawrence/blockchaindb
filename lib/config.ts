import type { AppConfig } from "./types";
import { DEFAULT_NETWORK, findByChainId } from "./networks";

export const DEFAULT_RPC_URL = DEFAULT_NETWORK.rpcUrl; // Polygon Amoy

/** Read config fresh on every call so .env.local edits apply immediately. */
export function getConfig(): AppConfig {
  const key = (process.env.PRIVATE_KEY ?? "").trim();
  return {
    rpcUrl: (process.env.RPC_URL ?? "").trim() || DEFAULT_RPC_URL,
    privateKey: key ? (key.startsWith("0x") ? key : `0x${key}`) : "",
    contractAddress: (process.env.CONTRACT_ADDRESS ?? "").trim(),
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
