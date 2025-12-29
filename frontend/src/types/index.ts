// Types matching Solidity structs from Types.sol

export interface Point {
    x: bigint;
    y: bigint;
}

export interface EGCT {
    c1: Point;
    c2: Point;
}

export interface ProofPoints {
    a: [bigint, bigint];
    b: [[bigint, bigint], [bigint, bigint]];
    c: [bigint, bigint];
}

export interface RegisterProof {
    proofPoints: ProofPoints;
    publicSignals: bigint[];
}

export interface Offer {
    initiator: `0x${string}`;
    acceptor: `0x${string}`;
    assetBuy: `0x${string}`;
    assetSell: `0x${string}`;
    rate: bigint;
    maxAmountToSell: bigint;
    minAmountToSell: bigint;
    expiresAt: bigint;
    amountToBuyEncryptionData: `0x${string}`;
    amountToBuyCommitmentData: `0x${string}`;
    initiatorApproveData: `0x${string}`;
}

export interface OfferAcceptanceProof {
    proofPoints: ProofPoints;
    publicSignals: bigint[];
}

export interface OfferFinalizationProof {
    proofPoints: ProofPoints;
    publicSignals: bigint[];
}

// Frontend specific types
export interface OfferWithId extends Offer {
    id: bigint;
}

export interface UserKeys {
    privateKey: bigint;
    formattedPrivateKey: bigint;
    publicKey: [bigint, bigint];
}

export type OfferStatus = 'open' | 'accepted' | 'finalized' | 'expired';

export interface TokenInfo {
    address: `0x${string}`;
    name: string;
    symbol: string;
    decimals: number;
}

export interface EncryptedBalance {
    eGCT: EGCT;
    balancePCT: bigint[];
    amountPCTs: bigint[][];
    nonce: bigint;
    transactionIndex: bigint;
}
