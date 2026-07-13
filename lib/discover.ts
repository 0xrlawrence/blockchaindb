import { Contract, getCreateAddress } from "ethers";
import { getConfig } from "./config";
import { getProvider, getWallet, withTimeout } from "./blockchain";
import { DATABASE_ABI } from "./contract";

/**
 * Contract auto-discovery — deploy with ONLY a private key.
 *
 * A contract's address is deterministic: keccak(rlp(deployer, nonce)). So
 * given just the wallet, we can recompute the address of every contract it
 * ever deployed by walking its nonces, and check which one is a live
 * Database.sol owned by the wallet. That means CONTRACT_ADDRESS never has
 * to be typed anywhere: deploy the contract from the dashboard once, and
 * every fresh serverless instance re-finds it from the wallet alone —
 * even when the address couldn't be persisted on a read-only host.
 */

const MAX_NONCES = 25; // dedicated DB wallets have few transactions
const TTL = 120_000;
const LOOKUP_TIMEOUT = 15_000;

interface DiscoverGlobals {
  __sbdbDiscover?: { at: number; key: string; promise: Promise<string | null> };
}
const g = globalThis as DiscoverGlobals;

async function search(): Promise<string | null> {
  const config = getConfig();
  if (config.contractAddress) return config.contractAddress;
  if (!config.privateKey || !config.rpcUrl) return null;

  try {
    const provider = getProvider();
    const walletAddress = getWallet().address;
    const nonce = await withTimeout<number>(
      provider.getTransactionCount(walletAddress),
      LOOKUP_TIMEOUT
    );

    // newest deployment first — it's the one currently in use
    for (let i = Math.min(nonce, MAX_NONCES) - 1; i >= 0; i--) {
      const candidate = getCreateAddress({ from: walletAddress, nonce: i });
      const code = await withTimeout<string>(
        provider.getCode(candidate),
        LOOKUP_TIMEOUT
      ).catch(() => "0x");
      if (code === "0x") continue;
      try {
        const owner = await withTimeout<string>(
          new Contract(candidate, DATABASE_ABI, provider).owner(),
          LOOKUP_TIMEOUT
        );
        if (owner.toLowerCase() === walletAddress.toLowerCase()) {
          process.env.CONTRACT_ADDRESS = candidate;
          return candidate;
        }
      } catch {
        // deployed something else at this nonce — keep looking
      }
    }
  } catch {
    // RPC unreachable — nothing to discover
  }
  return null;
}

/** Find the wallet's Database.sol when CONTRACT_ADDRESS is unset (memoized;
 *  applies the result to process.env). Never throws. */
export function discoverContract(): Promise<string | null> {
  const config = getConfig();
  if (config.contractAddress) return Promise.resolve(config.contractAddress);
  const key = `${config.rpcUrl}|${config.privateKey.slice(0, 10)}`;
  const now = Date.now();
  if (g.__sbdbDiscover && g.__sbdbDiscover.key === key && now - g.__sbdbDiscover.at < TTL) {
    return g.__sbdbDiscover.promise;
  }
  const promise = search();
  g.__sbdbDiscover = { at: now, key, promise };
  return promise;
}
