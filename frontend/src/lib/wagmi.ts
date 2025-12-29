import { http } from 'wagmi';
import { defineChain } from 'viem';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { MANTLE_SEPOLIA } from '../constants';

// Define Mantle Sepolia as a viem chain
export const mantleSepolia = defineChain({
    id: MANTLE_SEPOLIA.id,
    name: MANTLE_SEPOLIA.name,
    nativeCurrency: MANTLE_SEPOLIA.nativeCurrency,
    rpcUrls: MANTLE_SEPOLIA.rpcUrls,
    blockExplorers: MANTLE_SEPOLIA.blockExplorers,
    testnet: MANTLE_SEPOLIA.testnet,
});

// RainbowKit + Wagmi configuration
// Note: For production, get a real projectId from https://cloud.reown.com
export const config = getDefaultConfig({
    appName: 'ZEX - Confidential Token Swap',
    projectId: 'b02e46f352be5464ae2d5e2bd2640c83', // WalletConnect Cloud Project ID
    chains: [mantleSepolia],
    transports: {
        [mantleSepolia.id]: http(MANTLE_SEPOLIA.rpcUrls.default.http[0]),
    },
});

export type WagmiConfig = typeof config;

