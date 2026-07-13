/** A document stored on-chain. `data` is the parsed JSON payload. */
export interface DocumentRecord {
  id: number;
  collection: string;
  data: unknown;
  createdAt: number; // unix seconds
  updatedAt: number; // unix seconds
  encrypted?: boolean; // stored as an encrypted blob on-chain
  locked?: boolean; // encrypted but unreadable here (no key / wrong key)
}

export interface CollectionInfo {
  name: string;
  documentCount: number;
}

export interface AppConfig {
  rpcUrl: string;
  privateKey: string;
  contractAddress: string;
  apiKey: string;
  /** Comma-separated origins allowed to call the data API from a browser
   *  (e.g. "https://myapp.com,https://*.mybusiness.ph"). Empty = any site. */
  allowedOrigins: string;
}

export interface StatusResponse {
  connected: boolean;
  configured: {
    rpc: boolean;
    wallet: boolean;
    contract: boolean;
  };
  network: {
    name: string;
    chainId: number;
    blockNumber: number;
    rpcUrl: string;
    explorerUrl: string | null;
    currency: string;
    testnet: boolean | null; // null = unknown chain (custom RPC)
    faucetUrl: string | null;
  } | null;
  wallet: {
    address: string;
    balance: string; // formatted in native token
  } | null;
  contract: {
    address: string;
    owner: string | null;
  } | null;
  stats: {
    collections: number;
    documents: number;
  } | null;
  encryption: {
    enabled: boolean; // new document writes are encrypted on-chain
  };
  api: {
    keyConfigured: boolean; // external API access requires a key
  };
  lastTxHash: string | null;
  error: string | null;
}
