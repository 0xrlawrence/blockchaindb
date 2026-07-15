import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";
import { getConfig } from "./config";
import { getReadContract, getWriteContract } from "./contract";
import { withTimeout } from "./blockchain";
import { setLastTxHash } from "./config";
import { discoverContract } from "./discover";

/**
 * On-chain settings store — persistence for serverless hosts.
 *
 * Vercel/Netlify filesystems are read-only and instances are ephemeral, so
 * `.env.local` can't hold settings there. Dashboard-managed settings
 * (password, allowed domains, data visibility, api key) are instead stored
 * in the database contract itself, in a reserved `_settings` collection, as
 * ONE document holding an AES-256-GCM blob. The cipher key is derived from
 * the wallet PRIVATE_KEY with a dedicated salt, independent of the document
 * encryption layer — so the blob is always encrypted regardless of the
 * public/private data-visibility mode, and rotating a custom ENCRYPTION_KEY
 * never locks the settings.
 *
 * Boot order on a serverless instance: the three bootstrap env vars
 * (RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS) come from the hosting dashboard,
 * then `hydrateSettings()` overlays the on-chain values onto process.env for
 * every key the host env left unset — real hosting env vars always win, so
 * a forgotten password can be recovered by setting DASHBOARD_PASSWORD
 * directly on the host.
 */

export const SETTINGS_COLLECTION = "_settings";

/** env keys that may live on-chain (everything else is bootstrap-only).
 *  ENCRYPTION_KEY is safe here: the settings blob is encrypted with the
 *  wallet PRIVATE_KEY (not the ENCRYPTION_KEY), so there's no circular
 *  dependency and it can be set from the dashboard on read-only hosts. */
export const CHAIN_SETTING_KEYS = [
  "DASHBOARD_PASSWORD",
  "ALLOWED_ORIGINS",
  "DATA_VISIBILITY",
  "API_KEY",
  "ENCRYPTION_KEY",
] as const;
export type ChainSettingKey = (typeof CHAIN_SETTING_KEYS)[number];

const PREFIX = "sbs:v1:";
const SALT = "starboardb:settings:v1"; // fixed, non-secret; PRIVATE_KEY is the secret
const CACHE_TTL = 60_000;
const READ_TIMEOUT = 15_000;
const WRITE_TIMEOUT = 120_000;

interface StoreGlobals {
  __sbdbBootEnv?: Partial<Record<ChainSettingKey, string>>;
  __sbdbHydrate?: { at: number; promise: Promise<void> } | null;
}
const g = globalThis as StoreGlobals;

/* Snapshot the env the process actually booted with (hosting env vars +
 * .env.local), before any on-chain overlay mutates process.env. */
function bootEnv(): Partial<Record<ChainSettingKey, string>> {
  if (!g.__sbdbBootEnv) {
    g.__sbdbBootEnv = Object.fromEntries(
      CHAIN_SETTING_KEYS.map((k) => [k, (process.env[k] ?? "").trim()])
    );
  }
  return g.__sbdbBootEnv;
}

let keyCache: { material: string; key: Buffer } | null = null;

function cipherKey(): Buffer | null {
  const { privateKey } = getConfig();
  if (!privateKey) return null;
  if (keyCache && keyCache.material === privateKey) return keyCache.key;
  const key = scryptSync(privateKey, SALT, 32);
  keyCache = { material: privateKey, key };
  return key;
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function decrypt(stored: string, key: Buffer): string | null {
  if (!stored.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function chainReady(): boolean {
  const c = getConfig();
  return Boolean(c.rpcUrl && c.privateKey && c.contractAddress);
}

/**
 * A stable-per-deployment identifier, so the on-chain dashboard password
 * belongs to ONE deployment instead of every deployment that shares the
 * wallet/contract. Vercel/Netlify expose a project-stable value that differs
 * between forks but survives redeploys of the same project. Empty when the
 * host isn't identifiable — in which case the on-chain password is treated as
 * not-ours (a fresh deployment then asks for its own password rather than
 * inheriting one). The password blob stores this under `__pwBinding`.
 */
const PW_BINDING_KEY = "__pwBinding";
export function deploymentId(): string {
  return (
    process.env.VERCEL_PROJECT_PRODUCTION_URL || // vercel: stable per project
    process.env.VERCEL_PROJECT_ID ||
    process.env.SITE_ID || // netlify
    process.env.SITE_NAME ||
    ""
  ).trim();
}

/** Does an on-chain password blob (with its stored binding) belong to THIS
 *  deployment? False for a fresh fork (different id) or a legacy/unbound blob
 *  (undefined), and false when the host can't be identified — so those cases
 *  onboard for a new password instead of inheriting one. Exported for tests. */
export function passwordBindingMatches(storedBinding: string | undefined): boolean {
  const id = deploymentId();
  return id.length > 0 && storedBinding === id;
}

interface RawDoc {
  id: bigint;
  data: string;
}

/** Read the raw settings doc straight from the contract (no document-layer
 *  decryption — the blob has its own cipher). */
async function readDoc(): Promise<{ id: number; values: Record<string, string> } | null> {
  const key = cipherKey();
  if (!key) return null;
  const contract = getReadContract();
  let docs: RawDoc[];
  try {
    docs = await withTimeout<RawDoc[]>(
      contract.list(SETTINGS_COLLECTION),
      READ_TIMEOUT
    );
  } catch {
    return null; // collection doesn't exist yet
  }
  for (const doc of docs) {
    const text = decrypt(doc.data, key);
    if (text) {
      try {
        return { id: Number(doc.id), values: JSON.parse(text) };
      } catch {
        // corrupt blob — fall through
      }
    }
  }
  return null;
}

/** Merge + persist settings on-chain. Throws a descriptive error when the
 *  chain connection isn't bootstrapped. */
export async function writeChainSettings(
  partial: Partial<Record<ChainSettingKey, string>>
): Promise<void> {
  if (!chainReady()) {
    throw new Error(
      "This host has a read-only filesystem, so settings are stored on-chain here — which needs RPC_URL, PRIVATE_KEY and CONTRACT_ADDRESS set as hosting environment variables first (plus a little gas in the wallet). Alternatively set this value directly as a hosting environment variable."
    );
  }
  const key = cipherKey();
  if (!key) throw new Error("PRIVATE_KEY is required to encrypt settings.");

  const current = (await readDoc()) ?? { id: -1, values: {} };
  const values = { ...current.values };
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) continue;
    if (v === "") delete values[k];
    else values[k] = v;
  }

  // Bind the password to THIS deployment so a fresh fork doesn't inherit it.
  if ("DASHBOARD_PASSWORD" in partial) {
    if (partial.DASHBOARD_PASSWORD) values[PW_BINDING_KEY] = deploymentId();
    else delete values[PW_BINDING_KEY];
  }

  const blob = encrypt(JSON.stringify(values), key);
  const contract = getWriteContract();
  const tx =
    current.id >= 0
      ? await withTimeout(
          contract.update(SETTINGS_COLLECTION, current.id, blob),
          WRITE_TIMEOUT
        )
      : await withTimeout(contract.create(SETTINGS_COLLECTION, blob), WRITE_TIMEOUT);
  const receipt = await withTimeout<{ hash?: string }>(tx.wait(), WRITE_TIMEOUT);
  if (receipt?.hash) setLastTxHash(receipt.hash);

  // apply immediately and force the next hydrate to re-read
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) process.env[k] = v;
  }
  invalidateSettingsCache();
}

export function invalidateSettingsCache(): void {
  g.__sbdbHydrate = null;
}

/**
 * Overlay on-chain settings onto process.env (memoized, 60s TTL). Only keys
 * the boot environment left EMPTY are overlaid — a real hosting env var
 * always wins. Never throws; an unreachable chain just means no overlay.
 */
export function hydrateSettings(): Promise<void> {
  bootEnv(); // snapshot before anything mutates process.env
  const now = Date.now();
  if (g.__sbdbHydrate && now - g.__sbdbHydrate.at < CACHE_TTL) {
    return g.__sbdbHydrate.promise;
  }
  const promise = (async () => {
    // No contract configured? It may still exist — recompute it from the
    // wallet's deployment nonces (private-key-only deploys).
    if (!getConfig().contractAddress) await discoverContract();
    if (!chainReady()) return;
    try {
      const doc = await readDoc();
      if (!doc) return;
      const boot = bootEnv();
      // The stored password only applies to the deployment that set it. A
      // fresh fork (or a legacy/unbound blob) sees no password and onboards.
      const pwIsOurs = passwordBindingMatches(doc.values[PW_BINDING_KEY]);
      for (const k of CHAIN_SETTING_KEYS) {
        if (boot[k]) continue; // host env var wins
        if (k === "DASHBOARD_PASSWORD" && !pwIsOurs) continue;
        const v = doc.values[k];
        if (typeof v === "string") process.env[k] = v;
      }
    } catch {
      // no overlay — env-only behavior
    }
  })();
  g.__sbdbHydrate = { at: now, promise };
  return promise;
}
