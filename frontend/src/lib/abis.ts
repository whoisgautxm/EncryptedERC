// Registrar ABI - User registration and public key management
export const REGISTRAR_ABI = [
    {
        inputs: [{ name: 'user', type: 'address' }],
        name: 'isUserRegistered',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'user', type: 'address' }],
        name: 'getUserPublicKey',
        outputs: [{ name: '', type: 'uint256[2]' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            {
                components: [
                    {
                        components: [
                            { name: 'a', type: 'uint256[2]' },
                            { name: 'b', type: 'uint256[2][2]' },
                            { name: 'c', type: 'uint256[2]' },
                        ],
                        name: 'proofPoints',
                        type: 'tuple',
                    },
                    { name: 'publicSignals', type: 'uint256[5]' },
                ],
                name: 'proof',
                type: 'tuple',
            },
        ],
        name: 'register',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const;

// ZexSwapFacet ABI - Swap operations
export const ZEX_SWAP_ABI = [
    // Events
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'offerId', type: 'uint256' },
            { indexed: true, name: 'initiator', type: 'address' },
            { indexed: false, name: 'assetBuy', type: 'address' },
            { indexed: false, name: 'assetSell', type: 'address' },
            { indexed: false, name: 'rate', type: 'uint256' },
            { indexed: false, name: 'maxAmountToSell', type: 'uint256' },
        ],
        name: 'OfferCreated',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'offerId', type: 'uint256' },
            { indexed: true, name: 'acceptor', type: 'address' },
        ],
        name: 'OfferAccepted',
        type: 'event',
    },
    {
        anonymous: false,
        inputs: [{ indexed: true, name: 'offerId', type: 'uint256' }],
        name: 'SwapFinalized',
        type: 'event',
    },
    // Functions
    {
        inputs: [
            { name: 'assetBuy', type: 'address' },
            { name: 'assetSell', type: 'address' },
            { name: 'rate', type: 'uint256' },
            { name: 'maxAmountToSell', type: 'uint256' },
            { name: 'minAmountToSell', type: 'uint256' },
            { name: 'expiresAt', type: 'uint256' },
            { name: 'approveData', type: 'bytes' },
        ],
        name: 'initiateOffer',
        outputs: [{ name: 'offerId', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'offerId', type: 'uint256' },
            { name: 'approveData', type: 'bytes' },
            { name: 'proofData', type: 'bytes' },
        ],
        name: 'acceptOffer',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'offerId', type: 'uint256' },
            { name: 'transferFromData', type: 'bytes' },
            { name: 'proofData', type: 'bytes' },
        ],
        name: 'finalizeSwap',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ name: 'offerId', type: 'uint256' }],
        name: 'getOffer',
        outputs: [
            {
                components: [
                    { name: 'initiator', type: 'address' },
                    { name: 'acceptor', type: 'address' },
                    { name: 'assetBuy', type: 'address' },
                    { name: 'assetSell', type: 'address' },
                    { name: 'rate', type: 'uint256' },
                    { name: 'maxAmountToSell', type: 'uint256' },
                    { name: 'minAmountToSell', type: 'uint256' },
                    { name: 'expiresAt', type: 'uint256' },
                    { name: 'amountToBuyEncryptionData', type: 'bytes' },
                    { name: 'amountToBuyCommitmentData', type: 'bytes' },
                    { name: 'initiatorApproveData', type: 'bytes' },
                ],
                name: '',
                type: 'tuple',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'nextOfferId',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// ZexTokenFacet ABI - Token info and balances
export const ZEX_TOKEN_ABI = [
    {
        inputs: [],
        name: 'name',
        outputs: [{ name: '', type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'symbol',
        outputs: [{ name: '', type: 'string' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOfStandalone',
        outputs: [
            {
                components: [
                    {
                        components: [
                            {
                                components: [
                                    { name: 'x', type: 'uint256' },
                                    { name: 'y', type: 'uint256' },
                                ],
                                name: 'c1',
                                type: 'tuple',
                            },
                            {
                                components: [
                                    { name: 'x', type: 'uint256' },
                                    { name: 'y', type: 'uint256' },
                                ],
                                name: 'c2',
                                type: 'tuple',
                            },
                        ],
                        name: 'eGCT',
                        type: 'tuple',
                    },
                    { name: 'balancePCT', type: 'uint256[7]' },
                    { name: 'amountPCTs', type: 'uint256[7][]' },
                    { name: 'nonce', type: 'uint256' },
                    { name: 'transactionIndex', type: 'uint256' },
                ],
                name: '',
                type: 'tuple',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'isAuditorKeySet',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

// ZexAllowanceFacet ABI - Allowance operations
export const ZEX_ALLOWANCE_ABI = [
    {
        inputs: [
            { name: 'approver', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'newBalanceEncryptionData', type: 'bytes' },
            { name: 'amountCommitmentData', type: 'bytes' },
            { name: 'proofData', type: 'bytes' },
        ],
        name: 'publicConfidentialApprove',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { name: 'approver', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'tokenId', type: 'uint256' },
        ],
        name: 'getAllowance',
        outputs: [
            {
                components: [
                    {
                        components: [
                            { name: 'x', type: 'uint256' },
                            { name: 'y', type: 'uint256' },
                        ],
                        name: 'c1',
                        type: 'tuple',
                    },
                    {
                        components: [
                            { name: 'x', type: 'uint256' },
                            { name: 'y', type: 'uint256' },
                        ],
                        name: 'c2',
                        type: 'tuple',
                    },
                ],
                name: 'encryptedAmount',
                type: 'tuple',
            },
            { name: 'amountPCT', type: 'uint256[7]' },
            { name: 'isPublic', type: 'bool' },
            { name: 'publicAmount', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
] as const;
