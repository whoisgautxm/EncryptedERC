// Contract Addresses on Mantle Sepolia (chainId: 5003)
export const CONTRACTS = {
    DIAMOND_PROXY: '0x4caD62E2E3618C64B20c9a0636D129fE6eDDB591',
    REGISTRAR: '0x925fB09b836aBfFE0c42b91A1D1B8d254e787fcb',
} as const;

// Mantle Sepolia Chain Configuration
export const MANTLE_SEPOLIA = {
    id: 5003,
    name: 'Mantle Sepolia',
    nativeCurrency: {
        name: 'MNT',
        symbol: 'MNT',
        decimals: 18,
    },
    rpcUrls: {
        default: {
            http: ['https://rpc.sepolia.mantle.xyz'],
        },
        public: {
            http: ['https://rpc.sepolia.mantle.xyz'],
        },
    },
    blockExplorers: {
        default: {
            name: 'Mantle Sepolia Explorer',
            url: 'https://sepolia.mantlescan.xyz',
        },
    },
    testnet: true,
} as const;

// Circuit file paths (relative to public folder)
export const CIRCUITS = {
    REGISTRATION: {
        wasm: '/circuits/RegistrationCircuit.wasm',
        zkey: '/circuits/RegistrationCircuit.groth16.zkey',
    },
    OFFER_ACCEPTANCE: {
        wasm: '/circuits/OfferAcceptanceCircuit.wasm',
        zkey: '/circuits/OfferAcceptanceCircuit.groth16.zkey',
    },
    OFFER_FINALIZATION: {
        wasm: '/circuits/OfferFinalizationCircuit.wasm',
        zkey: '/circuits/OfferFinalizationCircuit.groth16.zkey',
    },
} as const;

// Polling intervals
export const POLLING_INTERVAL = 10_000; // 10 seconds for orderbook refresh

// Token decimals (default for ZEX tokens)
export const TOKEN_DECIMALS = 2;
