/** Preset EVM networks selectable in Settings. Plain data — safe to import
    from both server and client code. Polygon Amoy is the default. */

export interface NetworkPreset {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  currency: string;
  testnet: boolean;
  faucetUrl?: string;
}

export const NETWORKS: NetworkPreset[] = [
  // ---- testnets ----
  {
    id: "polygon-amoy",
    name: "Polygon Amoy",
    chainId: 80002,
    rpcUrl: "https://polygon-amoy-bor-rpc.publicnode.com",
    explorerUrl: "https://amoy.polygonscan.com",
    currency: "POL",
    testnet: true,
    faucetUrl: "https://faucet.polygon.technology",
  },
  {
    id: "sepolia",
    name: "Ethereum Sepolia",
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorerUrl: "https://sepolia.etherscan.io",
    currency: "ETH",
    testnet: true,
    faucetUrl: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
  },
  {
    id: "base-sepolia",
    name: "Base Sepolia",
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    currency: "ETH",
    testnet: true,
    faucetUrl: "https://docs.base.org/base-chain/tools/network-faucets",
  },
  {
    id: "arbitrum-sepolia",
    name: "Arbitrum Sepolia",
    chainId: 421614,
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    explorerUrl: "https://sepolia.arbiscan.io",
    currency: "ETH",
    testnet: true,
    faucetUrl: "https://docs.arbitrum.io/for-devs/dev-tools-and-resources/chain-info",
  },
  {
    id: "op-sepolia",
    name: "OP Sepolia",
    chainId: 11155420,
    rpcUrl: "https://sepolia.optimism.io",
    explorerUrl: "https://sepolia-optimism.etherscan.io",
    currency: "ETH",
    testnet: true,
    faucetUrl: "https://console.optimism.io/faucet",
  },
  {
    id: "bnb-testnet",
    name: "BNB Testnet",
    chainId: 97,
    rpcUrl: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    explorerUrl: "https://testnet.bscscan.com",
    currency: "tBNB",
    testnet: true,
    faucetUrl: "https://www.bnbchain.org/en/testnet-faucet",
  },
  {
    id: "avalanche-fuji",
    name: "Avalanche Fuji",
    chainId: 43113,
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    explorerUrl: "https://testnet.snowtrace.io",
    currency: "AVAX",
    testnet: true,
    faucetUrl: "https://core.app/tools/testnet-faucet",
  },
  // ---- mainnets ----
  {
    id: "polygon",
    name: "Polygon",
    chainId: 137,
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    explorerUrl: "https://polygonscan.com",
    currency: "POL",
    testnet: false,
  },
  {
    id: "ethereum",
    name: "Ethereum",
    chainId: 1,
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    explorerUrl: "https://etherscan.io",
    currency: "ETH",
    testnet: false,
  },
  {
    id: "base",
    name: "Base",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    currency: "ETH",
    testnet: false,
  },
  {
    id: "arbitrum",
    name: "Arbitrum One",
    chainId: 42161,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    currency: "ETH",
    testnet: false,
  },
  {
    id: "op-mainnet",
    name: "OP Mainnet",
    chainId: 10,
    rpcUrl: "https://mainnet.optimism.io",
    explorerUrl: "https://optimistic.etherscan.io",
    currency: "ETH",
    testnet: false,
  },
  {
    id: "bnb",
    name: "BNB Chain",
    chainId: 56,
    rpcUrl: "https://bsc-dataseed.bnbchain.org",
    explorerUrl: "https://bscscan.com",
    currency: "BNB",
    testnet: false,
  },
  {
    id: "avalanche",
    name: "Avalanche C-Chain",
    chainId: 43114,
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    explorerUrl: "https://snowtrace.io",
    currency: "AVAX",
    testnet: false,
  },
];

export const DEFAULT_NETWORK = NETWORKS[0]; // Polygon Amoy

export function findByChainId(chainId: number): NetworkPreset | undefined {
  return NETWORKS.find((n) => n.chainId === chainId);
}

export function findByRpcUrl(rpcUrl: string): NetworkPreset | undefined {
  const clean = rpcUrl.trim().replace(/\/+$/, "");
  return NETWORKS.find((n) => n.rpcUrl.replace(/\/+$/, "") === clean);
}
