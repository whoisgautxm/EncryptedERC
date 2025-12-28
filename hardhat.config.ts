import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@solarity/chai-zkit";
import "@solarity/hardhat-zkit";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import type { HardhatUserConfig } from "hardhat/config";
import "solidity-coverage";

import dotenv from "dotenv";
dotenv.config();

// Private keys for deployment (set in .env file)
const PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.ACCOUNT_PRIVATE_KEY || "";
const PRIVATE_KEY_2 = process.env.PRIVATE_KEY_2 || ""; // Second wallet for E2E tests

// Mantlescan API key for verification (get from https://mantlescan.xyz/myapikey)
const MANTLESCAN_API_KEY = process.env.MANTLESCAN_API_KEY || process.env.API_KEY || "";

// RPC URLs
const RPC_URL = process.env.RPC_URL || "https://api.avax.network/ext/bc/C/rpc";
const MANTLE_RPC_URL = process.env.MANTLE_RPC_URL || "https://rpc.mantle.xyz";
const MANTLE_TESTNET_RPC_URL = process.env.MANTLE_TESTNET_RPC_URL || "https://rpc.sepolia.mantle.xyz";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 10,  // Reduced for smaller bytecode size
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,  // Allow large contracts for testing
      forking: {
        url: RPC_URL,
        blockNumber: 59121339,
        enabled: !!process.env.FORKING,
      },
    },
    // Mantle Mainnet
    mantle: {
      url: MANTLE_RPC_URL,
      chainId: 5000,
      accounts: [PRIVATE_KEY, ...(PRIVATE_KEY_2 ? [PRIVATE_KEY_2] : [])].filter(Boolean),
    },
    // Mantle Sepolia Testnet
    mantleSepolia: {
      url: MANTLE_TESTNET_RPC_URL,
      chainId: 5003,
      accounts: [PRIVATE_KEY, ...(PRIVATE_KEY_2 ? [PRIVATE_KEY_2] : [])].filter(Boolean),
      gasPrice: 20000000, // Recommended by Mantle docs
    },
  },
  // Etherscan/Mantlescan configuration for verification (V2 API format)
  etherscan: {
    // Use single API key for V2 (not per-network object)
    apiKey: MANTLESCAN_API_KEY,
    customChains: [
      {
        network: "mantle",
        chainId: 5000,
        urls: {
          apiURL: "https://api.mantlescan.xyz/api",
          browserURL: "https://mantlescan.xyz",
        },
      },
      {
        network: "mantleSepolia",
        chainId: 5003,
        urls: {
          apiURL: "https://api-sepolia.mantlescan.xyz/api",
          browserURL: "https://sepolia.mantlescan.xyz",
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
  gasReporter: {
    enabled: !!process.env.REPORT_GAS,
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    excludeContracts: ["contracts/mocks/"],
    outputFile: "gas-report.txt",
    L1: "avalanche",
    showMethodSig: true,
  },
  zkit: {
    compilerVersion: "2.1.9",
    circuitsDir: "circom",
    compilationSettings: {
      artifactsDir: "zkit/artifacts",
      onlyFiles: [],
      skipFiles: [],
      c: false,
      json: false,
      optimization: "O2",
    },
    setupSettings: {
      contributionSettings: {
        provingSystem: "groth16",
        contributions: 0,
      },
      onlyFiles: [],
      skipFiles: [],
      ptauDir: undefined,
      ptauDownload: true,
    },
    verifiersSettings: {
      verifiersDir: "contracts/verifiers",
      verifiersType: "sol",
    },
    typesDir: "generated-types/zkit",
    quiet: false,
  },
};

export default config;
