import type { ContractTransactionReceipt } from "ethers";
import { getReadContract, getWriteContract } from "./contract";
import { withTimeout } from "./blockchain";
import { setLastTxHash } from "./config";
import { encryptData, decryptData } from "./crypto";
import type { CollectionInfo, DocumentRecord } from "./types";

const WRITE_TIMEOUT = 120_000; // block inclusion can take a while on public testnets

interface RawDocument {
  id: bigint;
  data: string;
  createdAt: bigint;
  updatedAt: bigint;
}

function toDocument(collection: string, raw: RawDocument): DocumentRecord {
  const dec = decryptData(raw.data);
  let data: unknown;
  if (dec.locked) {
    data = null; // encrypted blob we can't read (no key / wrong key)
  } else {
    try {
      data = JSON.parse(dec.text as string);
    } catch {
      data = dec.text; // tolerate non-JSON payloads written by other tools
    }
  }
  return {
    id: Number(raw.id),
    collection,
    data,
    createdAt: Number(raw.createdAt),
    updatedAt: Number(raw.updatedAt),
    encrypted: dec.encrypted,
    locked: dec.locked,
  };
}

/**
 * BlockchainDB — the TypeScript SDK.
 *
 *   const db = new BlockchainDB()
 *   const { id } = await db.create("users", { name: "John", age: 25 })
 *   await db.get("users", id)
 *   await db.update("users", id, { age: 26 })
 *   await db.list("users")
 *   await db.delete("users", id)
 */
export class BlockchainDB {
  /** Collections starting with "_" are reserved for system storage (the
   *  on-chain settings store) and hidden from the data API. */
  private guard(collection: string): void {
    if (collection.startsWith("_")) {
      throw new Error(
        `Collection names starting with "_" are reserved (${collection}).`
      );
    }
  }

  async create(
    collection: string,
    data: unknown
  ): Promise<{ id: number; txHash: string }> {
    this.guard(collection);
    const contract = getWriteContract();
    const tx = await withTimeout(
      contract.create(collection, encryptData(JSON.stringify(data))),
      WRITE_TIMEOUT
    );
    const receipt = await withTimeout<ContractTransactionReceipt>(
      tx.wait(),
      WRITE_TIMEOUT
    );
    setLastTxHash(receipt.hash);

    // Recover the auto-incremented id from the DocumentCreated event.
    let id = 0;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === "DocumentCreated") {
          id = Number(parsed.args[1]);
          break;
        }
      } catch {
        // not one of ours
      }
    }
    return { id, txHash: receipt.hash };
  }

  async get(collection: string, id: number): Promise<DocumentRecord> {
    this.guard(collection);
    const contract = getReadContract();
    const raw = await withTimeout<RawDocument>(contract.get(collection, id));
    return toDocument(collection, raw);
  }

  async update(
    collection: string,
    id: number,
    data: unknown
  ): Promise<{ txHash: string }> {
    this.guard(collection);
    const contract = getWriteContract();
    const tx = await withTimeout(
      contract.update(collection, id, encryptData(JSON.stringify(data))),
      WRITE_TIMEOUT
    );
    const receipt = await withTimeout<ContractTransactionReceipt>(
      tx.wait(),
      WRITE_TIMEOUT
    );
    setLastTxHash(receipt.hash);
    return { txHash: receipt.hash };
  }

  async delete(collection: string, id: number): Promise<{ txHash: string }> {
    this.guard(collection);
    const contract = getWriteContract();
    const tx = await withTimeout(contract.remove(collection, id), WRITE_TIMEOUT);
    const receipt = await withTimeout<ContractTransactionReceipt>(
      tx.wait(),
      WRITE_TIMEOUT
    );
    setLastTxHash(receipt.hash);
    return { txHash: receipt.hash };
  }

  async list(collection: string): Promise<DocumentRecord[]> {
    this.guard(collection);
    const contract = getReadContract();
    const raw = await withTimeout<RawDocument[]>(contract.list(collection));
    return raw.map((doc) => toDocument(collection, doc));
  }

  async createCollection(name: string): Promise<{ txHash: string }> {
    this.guard(name);
    const contract = getWriteContract();
    const tx = await withTimeout(contract.createCollection(name), WRITE_TIMEOUT);
    const receipt = await withTimeout<ContractTransactionReceipt>(
      tx.wait(),
      WRITE_TIMEOUT
    );
    setLastTxHash(receipt.hash);
    return { txHash: receipt.hash };
  }

  async listCollections(): Promise<CollectionInfo[]> {
    const contract = getReadContract();
    const [names, counts] = await withTimeout<[string[], bigint[]]>(
      contract.listCollections()
    );
    return names
      .map((name, i) => ({
        name,
        documentCount: Number(counts[i]),
      }))
      .filter((c) => !c.name.startsWith("_")); // hide system collections
  }

  async stats(): Promise<{ collections: number; documents: number }> {
    const collections = await this.listCollections();
    return {
      collections: collections.length,
      documents: collections.reduce((sum, c) => sum + c.documentCount, 0),
    };
  }

  async owner(): Promise<string> {
    const contract = getReadContract();
    return withTimeout<string>(contract.owner());
  }
}
