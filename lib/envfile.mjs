import { readFileSync, writeFileSync, existsSync } from "fs";

/** The keys StarBoarDB manages; every other line in .env.local is preserved. */
export const MANAGED_KEYS = [
  "RPC_URL",
  "PRIVATE_KEY",
  "CONTRACT_ADDRESS",
  "API_KEY",
  "ALLOWED_ORIGINS",
  "DASHBOARD_PASSWORD",
  "DATA_VISIBILITY",
  "ENCRYPTION_KEY",
];

/**
 * Encode a value for a .env line. Rejects newlines (which would inject extra
 * env vars) and single-quotes both so `#`, spaces, and `=` survive a reload
 * (dotenv treats an unquoted `#` as a comment) and so no shell/variable
 * expansion applies to the value.
 * @param {string} value
 * @returns {string}
 */
export function encodeEnvValue(value) {
  if (/[\r\n]/.test(value)) {
    throw new Error("Environment values must not contain newlines.");
  }
  if (value.includes("'")) {
    throw new Error("Environment values must not contain single quotes.");
  }
  return `'${value}'`;
}

/**
 * Merge managed keys into existing .env text, preserving every other line
 * (comments and unrelated variables) and the original position of managed keys.
 * @param {string} existing
 * @param {Record<string, string>} updates
 * @returns {string}
 */
export function mergeEnv(existing, updates) {
  const lines = existing.length ? existing.split(/\r?\n/) : [];
  const seen = new Set();
  const out = [];

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const key = match?.[1];
    if (key && Object.prototype.hasOwnProperty.call(updates, key)) {
      if (!seen.has(key)) {
        out.push(`${key}=${encodeEnvValue(updates[key])}`);
        seen.add(key);
      }
      // drop duplicate managed lines
    } else {
      out.push(line);
    }
  }

  // Append managed keys that weren't already in the file, in canonical order.
  for (const key of MANAGED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(updates, key) && !seen.has(key)) {
      out.push(`${key}=${encodeEnvValue(updates[key])}`);
      seen.add(key);
    }
  }

  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n") + "\n";
}

/**
 * Write managed keys into the .env file at `path`, preserving other content.
 * @param {string} path
 * @param {Record<string, string>} updates
 */
export function writeEnvFile(path, updates) {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  writeFileSync(path, mergeEnv(existing, updates), "utf8");
}
