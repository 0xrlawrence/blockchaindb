import path from "path";
import { getConfig } from "./config";
import { writeEnvFile } from "./envfile.mjs";

const ENV_PATH = path.join(process.cwd(), ".env.local");

/**
 * Persist connection settings to .env.local and apply them to the running
 * process immediately. Omitted fields keep their current value; empty strings
 * clear the value. Every other line in .env.local (comments, unrelated
 * variables) is preserved, and values are safely encoded (see envfile.mjs).
 */
export async function persistEnv(next: {
  rpcUrl?: string;
  privateKey?: string;
  contractAddress?: string;
  apiKey?: string;
  allowedOrigins?: string;
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

  try {
    writeEnvFile(ENV_PATH, {
      RPC_URL: rpcUrl,
      PRIVATE_KEY: privateKey,
      CONTRACT_ADDRESS: contractAddress,
      API_KEY: apiKey,
      ALLOWED_ORIGINS: allowedOrigins,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
      throw new Error(
        "This host has a read-only filesystem (e.g. Vercel/Netlify), so settings can't be saved here. Set RPC_URL / PRIVATE_KEY / CONTRACT_ADDRESS / API_KEY / ALLOWED_ORIGINS as environment variables in your hosting dashboard instead."
      );
    }
    throw error;
  }

  process.env.RPC_URL = rpcUrl;
  process.env.PRIVATE_KEY = privateKey;
  process.env.CONTRACT_ADDRESS = contractAddress;
  process.env.API_KEY = apiKey;
  process.env.ALLOWED_ORIGINS = allowedOrigins;
}
