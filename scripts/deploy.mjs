/* Deploys contracts/Database.sol (via the compiled artifact in abi/Database.json)
   to whatever network RPC_URL points at, using PRIVATE_KEY. No Hardhat —
   plain ethers v6. The deployed address is written back to .env.local. */
import { readFileSync } from "fs";
import { JsonRpcProvider, Wallet, ContractFactory, formatEther } from "ethers";
import dotenv from "dotenv";
import { writeEnvFile } from "../lib/envfile.mjs";

dotenv.config({ path: ".env.local" });

const DEFAULT_RPC = "https://polygon-amoy-bor-rpc.publicnode.com"; // Polygon Amoy

async function main() {
  const rpcUrl = (process.env.RPC_URL ?? "").trim() || DEFAULT_RPC;
  const rawKey = (process.env.PRIVATE_KEY ?? "").trim();
  if (!rawKey) {
    throw new Error(
      "PRIVATE_KEY is not set in .env.local. Add a funded wallet key first (see .env.example)."
    );
  }
  const key = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(key, provider);
  const [network, balance] = await Promise.all([
    provider.getNetwork(),
    provider.getBalance(wallet.address),
  ]);

  console.log(`Network:  chain ${network.chainId} via ${rpcUrl}`);
  console.log(`Deployer: ${wallet.address} (balance ${formatEther(balance)})`);
  if (balance === 0n) {
    throw new Error(
      "Deployer wallet has no funds on this network — it can't pay for gas."
    );
  }

  const artifact = JSON.parse(readFileSync("abi/Database.json", "utf8"));
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log("Deploying Database.sol …");
  const contract = await factory.deploy();
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();

  console.log("");
  console.log(`Database deployed to: ${address}`);
  console.log(`Transaction:          ${receipt.hash}`);

  // Persist CONTRACT_ADDRESS back into .env.local, preserving any other
  // variables/comments already there (shared writer with the app).
  writeEnvFile(".env.local", {
    RPC_URL: rpcUrl,
    PRIVATE_KEY: rawKey,
    CONTRACT_ADDRESS: address,
  });
  console.log("");
  console.log("CONTRACT_ADDRESS saved to .env.local — start the app with: npm run dev");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
