/**
 * ZK Proof Generation Module
 * Handles generating proofs for registration, offer acceptance, and finalization
 */
import * as snarkjs from 'snarkjs';
import { CIRCUITS } from '../constants';
import { generateRegistrationHash, formatProofForContract, encryptMessage } from './crypto';

export interface ProofResult {
    proof: {
        a: [bigint, bigint];
        b: [[bigint, bigint], [bigint, bigint]];
        c: [bigint, bigint];
    };
    publicSignals: bigint[];
}

// Cache for loaded circuit files
const circuitCache = new Map<string, { wasm: ArrayBuffer; zkey: ArrayBuffer }>();

/**
 * Load circuit files (WASM and zkey) with caching
 */
async function loadCircuit(
    wasmPath: string,
    zkeyPath: string,
    onProgress?: (message: string) => void
): Promise<{ wasm: ArrayBuffer; zkey: ArrayBuffer }> {
    const cacheKey = wasmPath;

    if (circuitCache.has(cacheKey)) {
        return circuitCache.get(cacheKey)!;
    }

    onProgress?.('Loading circuit files...');

    const [wasmResponse, zkeyResponse] = await Promise.all([
        fetch(wasmPath),
        fetch(zkeyPath),
    ]);

    if (!wasmResponse.ok || !zkeyResponse.ok) {
        throw new Error('Failed to load circuit files');
    }

    onProgress?.('Parsing circuit data...');

    const [wasm, zkey] = await Promise.all([
        wasmResponse.arrayBuffer(),
        zkeyResponse.arrayBuffer(),
    ]);

    const result = { wasm, zkey };
    circuitCache.set(cacheKey, result);

    return result;
}

/**
 * Generate Registration ZK Proof
 * Proves: user knows private key that corresponds to public key and can register for this chain
 */
export async function generateRegistrationProof(
    formattedPrivateKey: bigint,
    publicKey: [bigint, bigint],
    userAddress: string,
    chainId: bigint,
    onProgress?: (message: string) => void
): Promise<ProofResult> {
    onProgress?.('Preparing registration proof inputs...');

    const registrationHash = generateRegistrationHash(chainId, formattedPrivateKey, userAddress);

    const input = {
        SenderPrivateKey: formattedPrivateKey.toString(),
        SenderPublicKey: [publicKey[0].toString(), publicKey[1].toString()],
        SenderAddress: BigInt(userAddress).toString(),
        ChainID: chainId.toString(),
        RegistrationHash: registrationHash.toString(),
    };

    onProgress?.('Loading registration circuit...');
    const { wasm, zkey } = await loadCircuit(CIRCUITS.REGISTRATION.wasm, CIRCUITS.REGISTRATION.zkey, onProgress);

    onProgress?.('Generating ZK proof (this may take 10-30 seconds)...');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        new Uint8Array(wasm),
        new Uint8Array(zkey)
    );

    onProgress?.('Proof generated successfully!');

    return {
        proof: formatProofForContract(proof),
        publicSignals: publicSignals.map((s: string) => BigInt(s)),
    };
}

/**
 * Generate Offer Acceptance ZK Proof
 * Proves: acceptor knows private key, amount is within max, and correctly encrypts amountToBuy
 */
export async function generateOfferAcceptanceProof(
    acceptorPrivateKey: bigint,
    acceptorPublicKey: [bigint, bigint],
    initiatorPublicKey: [bigint, bigint],
    amountToBuy: bigint,
    maxAmountToSell: bigint,
    rate: bigint,
    onProgress?: (message: string) => void
): Promise<ProofResult> {
    onProgress?.('Encrypting amount for initiator...');

    // Encrypt amountToBuy with initiator's public key
    const { cipher: encryptedAmount, random: encryptionRandom } = encryptMessage(
        initiatorPublicKey,
        amountToBuy
    );

    const input = {
        AcceptorPrivateKey: acceptorPrivateKey.toString(),
        AmountToBuy: amountToBuy.toString(),
        EncryptionRandom: encryptionRandom.toString(),
        AcceptorPublicKey: [acceptorPublicKey[0].toString(), acceptorPublicKey[1].toString()],
        InitiatorPublicKey: [initiatorPublicKey[0].toString(), initiatorPublicKey[1].toString()],
        MaxAmountToSell: maxAmountToSell.toString(),
        Rate: rate.toString(),
        AmountToBuyC1: [encryptedAmount[0][0].toString(), encryptedAmount[0][1].toString()],
        AmountToBuyC2: [encryptedAmount[1][0].toString(), encryptedAmount[1][1].toString()],
    };

    onProgress?.('Loading offer acceptance circuit...');
    const { wasm, zkey } = await loadCircuit(
        CIRCUITS.OFFER_ACCEPTANCE.wasm,
        CIRCUITS.OFFER_ACCEPTANCE.zkey,
        onProgress
    );

    onProgress?.('Generating ZK proof (this may take 10-30 seconds)...');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        new Uint8Array(wasm),
        new Uint8Array(zkey)
    );

    onProgress?.('Proof generated successfully!');

    return {
        proof: formatProofForContract(proof),
        publicSignals: publicSignals.map((s: string) => BigInt(s)),
    };
}

/**
 * Generate Offer Finalization ZK Proof
 * Proves: rate enforcement (sellAmount * rate = amountToBuy) and correctly encrypts sellAmount
 */
export async function generateOfferFinalizationProof(
    initiatorPrivateKey: bigint,
    initiatorPublicKey: [bigint, bigint],
    acceptorPublicKey: [bigint, bigint],
    amountToBuy: bigint,
    sellAmount: bigint,
    rate: bigint,
    amountToBuyC1: [bigint, bigint],
    amountToBuyC2: [bigint, bigint],
    onProgress?: (message: string) => void
): Promise<ProofResult> {
    onProgress?.('Encrypting sell amount for acceptor...');

    // Encrypt sellAmount with acceptor's public key
    const { cipher: sellAmountEncrypted, random: sellEncryptionRandom } = encryptMessage(
        acceptorPublicKey,
        sellAmount
    );

    const input = {
        InitiatorPrivateKey: initiatorPrivateKey.toString(),
        AmountToBuy: amountToBuy.toString(),
        SellAmount: sellAmount.toString(),
        SellEncryptionRandom: sellEncryptionRandom.toString(),
        InitiatorPublicKey: [initiatorPublicKey[0].toString(), initiatorPublicKey[1].toString()],
        AcceptorPublicKey: [acceptorPublicKey[0].toString(), acceptorPublicKey[1].toString()],
        Rate: rate.toString(),
        AmountToBuyC1: [amountToBuyC1[0].toString(), amountToBuyC1[1].toString()],
        AmountToBuyC2: [amountToBuyC2[0].toString(), amountToBuyC2[1].toString()],
        SellAmountC1: [sellAmountEncrypted[0][0].toString(), sellAmountEncrypted[0][1].toString()],
        SellAmountC2: [sellAmountEncrypted[1][0].toString(), sellAmountEncrypted[1][1].toString()],
    };

    onProgress?.('Loading offer finalization circuit...');
    const { wasm, zkey } = await loadCircuit(
        CIRCUITS.OFFER_FINALIZATION.wasm,
        CIRCUITS.OFFER_FINALIZATION.zkey,
        onProgress
    );

    onProgress?.('Generating ZK proof (this may take 10-30 seconds)...');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        new Uint8Array(wasm),
        new Uint8Array(zkey)
    );

    onProgress?.('Proof generated successfully!');

    return {
        proof: formatProofForContract(proof),
        publicSignals: publicSignals.map((s: string) => BigInt(s)),
    };
}

/**
 * Encode proof data for contract submission
 */
export function encodeProofForContract(
    proofResult: ProofResult,
    signalCount: 5 | 10 | 13
): `0x${string}` {
    // This will be encoded using viem's encodeAbiParameters
    // For now, return a placeholder - actual encoding happens in hooks
    const { proof, publicSignals } = proofResult;

    return '0x' as `0x${string}`;
}
