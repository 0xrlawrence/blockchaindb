import { NextRequest, NextResponse } from "next/server";
import { ContractFactory, formatEther } from "ethers";
import DatabaseArtifact from "@/abi/Database.json";
import { getWallet, withTimeout } from "@/lib/blockchain";
import { networkName, setLastTxHash } from "@/lib/config";
import { persistEnv } from "@/lib/env";
import { requireDashboard } from "@/lib/auth";
import { hydrateSettings } from "@/lib/settingsStore";

export const dynamic = "force-dynamic";

const DEPLOY_TIMEOUT = 180_000;

/**
 * POST /api/deploy
 * { "confirm": true }
 * Deploys Database.sol with the configured wallet on the configured network,
 * then persists the new address as CONTRACT_ADDRESS in .env.local.
 */
export async function POST(req: NextRequest) {
  await hydrateSettings();
  const blocked = requireDashboard(req);
  if (blocked) return blocked;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== true) {
      return NextResponse.json(
        { error: "Pass { \"confirm\": true } — deploying sends a transaction." },
        { status: 400 }
      );
    }

    const wallet = getWallet(); // throws a clear error if PRIVATE_KEY unset
    const provider = wallet.provider!;
    const [network, balance] = await withTimeout(
      Promise.all([
        provider.getNetwork(),
        provider.getBalance(wallet.address),
      ])
    );
    const chainName = networkName(Number(network.chainId));

    if (balance === 0n) {
      return NextResponse.json(
        {
          error: `Wallet ${wallet.address} has no funds on ${chainName} — it can't pay for deployment gas.`,
        },
        { status: 400 }
      );
    }

    const factory = new ContractFactory(
      DatabaseArtifact.abi,
      DatabaseArtifact.bytecode,
      wallet
    );
    // factory.deploy() resolves once the tx is broadcast (not yet mined).
    const contract = await withTimeout(factory.deploy(), 90_000);
    const deployTx = contract.deploymentTransaction()!;
    const address = await contract.getAddress();

    // Persist the address NOW, before waiting for confirmation. If confirmation
    // is slow (or this request times out), the tx is already broadcast and its
    // address is saved — so the user never pays twice or loses the address.
    setLastTxHash(deployTx.hash);
    await persistEnv({ contractAddress: address });

    // Wait for mining, but a timeout here is "pending", not a failure.
    let confirmed = true;
    try {
      await withTimeout(deployTx.wait(), DEPLOY_TIMEOUT);
    } catch {
      confirmed = false;
    }

    return NextResponse.json({
      address,
      txHash: deployTx.hash,
      network: chainName,
      deployer: wallet.address,
      confirmed,
      balanceAfter: confirmed
        ? formatEther(await provider.getBalance(wallet.address))
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "deploy failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
