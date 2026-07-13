import { NextResponse } from "next/server";
import { getConfig, getLastTxHash } from "@/lib/config";
import { getNetworkSnapshot } from "@/lib/blockchain";
import { findByChainId } from "@/lib/networks";
import { isEncryptionAvailable } from "@/lib/crypto";
import { apiKeyConfigured } from "@/lib/auth";
import { hydrateSettings } from "@/lib/settingsStore";
import { BlockchainDB } from "@/lib/database";
import type { StatusResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/status — network, wallet, contract, and database stats in one call. */
export async function GET() {
  await hydrateSettings();
  const config = getConfig();
  const status: StatusResponse = {
    connected: false,
    configured: {
      rpc: Boolean(config.rpcUrl),
      wallet: Boolean(config.privateKey),
      contract: Boolean(config.contractAddress),
    },
    network: null,
    wallet: null,
    contract: null,
    stats: null,
    encryption: { enabled: isEncryptionAvailable() },
    api: { keyConfigured: apiKeyConfigured() },
    lastTxHash: getLastTxHash(),
    error: null,
  };

  try {
    const snapshot = await getNetworkSnapshot();
    const preset = findByChainId(snapshot.chainId);
    status.connected = true;
    status.network = {
      name: snapshot.name,
      chainId: snapshot.chainId,
      blockNumber: snapshot.blockNumber,
      rpcUrl: snapshot.rpcUrl,
      explorerUrl: snapshot.explorerUrl,
      currency: preset?.currency ?? "ETH",
      testnet: preset ? preset.testnet : null,
      faucetUrl: preset?.faucetUrl ?? null,
    };
    if (snapshot.walletAddress) {
      status.wallet = {
        address: snapshot.walletAddress,
        balance: snapshot.balance ?? "0",
      };
    }
  } catch (error) {
    status.error = error instanceof Error ? error.message : "RPC unreachable";
    return NextResponse.json(status);
  }

  if (config.contractAddress) {
    const db = new BlockchainDB();
    try {
      const [owner, stats] = await Promise.all([db.owner(), db.stats()]);
      status.contract = { address: config.contractAddress, owner };
      status.stats = stats;
    } catch (error) {
      status.contract = { address: config.contractAddress, owner: null };
      status.error =
        error instanceof Error
          ? `Contract unreachable: ${error.message}`
          : "Contract unreachable";
    }
  }

  return NextResponse.json(status);
}
