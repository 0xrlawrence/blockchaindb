import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
} from "crypto";
import { getConfig } from "./config";

/**
 * Document-payload encryption. In "private" mode (the default) contents are
 * encrypted with AES-256-GCM before they're written on-chain, so the public
 * ledger only stores an opaque blob. The key is derived from a custom
 * ENCRYPTION_KEY if one is set (bring-your-own-key, e.g. `openssl rand -hex
 * 32`), otherwise from the wallet's PRIVATE_KEY — so only the key owner can
 * decrypt. In "public" mode (DATA_VISIBILITY=public) payloads go on-chain as
 * readable plaintext by choice.
 *
 * On-chain format:  enc:v1:<base64( iv[12] | tag[16] | ciphertext )>
 * Anything without the enc:v1: prefix is treated as legacy plaintext, so
 * documents written before encryption was added still read fine. Reads
 * always try to decrypt regardless of visibility mode, so flipping to
 * public never locks existing encrypted documents.
 */

const PREFIX = "enc:v1:";
// Collection names double as on-chain mapping keys, so they can't use the
// random-IV scheme above — the same name has to encrypt to the same value
// every time, or lookups break. Names use a separate prefix and convergent
// (deterministic) encryption: the IV is derived from the name itself.
const NAME_PREFIX = "enc:c1:";
const SALT = "blockchaindb:enc:v1"; // fixed, non-secret; the key material is the secret
const NAME_IV_SALT = "blockchaindb:name-iv:v1"; // domain-separates the name IV HMAC

// scrypt is deliberately slow, so cache the derived key per key material.
let cache: { material: string; key: Buffer } | null = null;

function keyMaterial(): Buffer | null {
  const { privateKey, encryptionKey } = getConfig();
  const material = encryptionKey || privateKey;
  if (!material) return null;
  if (cache && cache.material === material) return cache.key;
  const key = scryptSync(material, SALT, 32);
  cache = { material, key };
  return key;
}

/** True when new writes will be encrypted: private mode + key material. */
export function isEncryptionAvailable(): boolean {
  return getConfig().dataVisibility === "private" && keyMaterial() !== null;
}

/** True when a bring-your-own ENCRYPTION_KEY overrides the wallet key. */
export function usesCustomKey(): boolean {
  return getConfig().encryptionKey.length > 0;
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/** True when a value is an encrypted collection name. */
export function isEncryptedName(stored: string): boolean {
  return stored.startsWith(NAME_PREFIX);
}

/**
 * Encrypt a collection name for on-chain storage. Collection names are used
 * as Solidity mapping keys, so encryption must be *deterministic* — the same
 * name must always produce the same ciphertext, or create/get/list/delete
 * would each look up a different key. We get that with convergent encryption:
 * the 12-byte IV is HMAC(key, name) rather than random, so AES-256-GCM yields
 * a stable ciphertext per (key, name). This deliberately leaks name-equality
 * (identical names encrypt identically), which is harmless here because
 * collection names are unique within a database.
 *
 * Returns the name unchanged in public mode or when no key material exists,
 * so lookups still work when encryption is off.
 */
export function encryptName(name: string): string {
  if (getConfig().dataVisibility === "public") return name;
  const key = keyMaterial();
  if (!key) return name;
  const iv = createHmac("sha256", key)
    .update(NAME_IV_SALT)
    .update(name)
    .digest()
    .subarray(0, 12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(name, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    NAME_PREFIX +
    Buffer.concat([iv, tag, ciphertext]).toString("base64url")
  );
}

/**
 * Decrypt a collection name for display. Legacy plaintext names (no prefix)
 * and names we can't decrypt (no key) pass through unchanged.
 */
export function decryptName(stored: string): string {
  if (!isEncryptedName(stored)) return stored; // legacy plaintext name
  const key = keyMaterial();
  if (!key) return stored; // locked — surface the opaque value rather than throw
  try {
    const raw = Buffer.from(stored.slice(NAME_PREFIX.length), "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return stored;
  }
}

/** Encrypt a payload for on-chain storage. Writes plaintext when the owner
 *  chose public visibility, or when no key material exists. */
export function encryptData(plaintext: string): string {
  if (getConfig().dataVisibility === "public") return plaintext;
  const key = keyMaterial();
  if (!key) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export interface Decrypted {
  /** decrypted plaintext, or null when locked */
  text: string | null;
  /** was the stored value an encrypted blob? */
  encrypted: boolean;
  /** encrypted but we can't read it (no key, wrong key, or tampered) */
  locked: boolean;
}

/** Decrypt an on-chain value. Plaintext values pass through unchanged. */
export function decryptData(stored: string): Decrypted {
  if (!isEncrypted(stored)) {
    return { text: stored, encrypted: false, locked: false };
  }
  const key = keyMaterial();
  if (!key) return { text: null, encrypted: true, locked: true };
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return { text: plaintext, encrypted: true, locked: false };
  } catch {
    return { text: null, encrypted: true, locked: true };
  }
}
