/**
 * Crypto utilities for BabyJubJub curve operations
 * Adapted from the project's existing cryptography implementation
 */
import { Base8, mulPointEscalar, subOrder, addPoint, Fr } from '@zk-kit/baby-jubjub';
import { formatPrivKeyForBabyJub, genPrivKey, genRandomBabyJubValue } from 'maci-crypto';
import { poseidon3 } from 'poseidon-lite';
import type { UserKeys } from '../types';

// Constants
export const BASE_POINT_ORDER =
    2736030358979909402780800718157159386076813972158567259200215660948447373041n;
export const BN254_SCALAR_FIELD =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Generate a new BabyJubJub keypair
 * @returns UserKeys with privateKey, formattedPrivateKey, and publicKey
 */
export function generateKeyPair(): UserKeys {
    // Generate private key
    const privateKey = genPrivKey();

    // Format private key for BabyJubJub
    const formattedPrivateKey = formatPrivKeyForBabyJub(privateKey) % subOrder;

    // Generate public key
    const publicKeyPoint = mulPointEscalar(Base8, formattedPrivateKey);
    const publicKey: [bigint, bigint] = [BigInt(publicKeyPoint[0]), BigInt(publicKeyPoint[1])];

    return {
        privateKey,
        formattedPrivateKey,
        publicKey,
    };
}

/**
 * Generate registration hash for ZK proof
 * CRH(CHAIN_ID | FORMATTED_PRIVATE_KEY | USER_ADDRESS)
 */
export function generateRegistrationHash(
    chainId: bigint,
    formattedPrivateKey: bigint,
    userAddress: string
): bigint {
    return poseidon3([
        chainId,
        formattedPrivateKey,
        BigInt(userAddress),
    ]);
}

/**
 * Encrypt a message using ElGamal encryption on BabyJubJub curve
 * @param publicKey Recipient's public key
 * @param message Message to encrypt (as bigint)
 * @param random Optional randomness (generated if not provided)
 * @returns Encrypted ciphertext and randomness used
 */
export function encryptMessage(
    publicKey: [bigint, bigint],
    message: bigint,
    random?: bigint
): { cipher: [[bigint, bigint], [bigint, bigint]]; random: bigint } {
    let encRandom = random ?? genRandomBabyJubValue();
    if (encRandom >= BASE_POINT_ORDER) {
        encRandom = genRandomBabyJubValue() / 100n;
    }

    // Message point: M = message * G
    const messagePoint = mulPointEscalar(Base8, message);

    // C1 = random * G
    const c1 = mulPointEscalar(Base8, encRandom);

    // C2 = M + random * PK
    const pkRandom = mulPointEscalar([publicKey[0], publicKey[1]], encRandom);
    const c2 = addPoint(messagePoint, pkRandom);

    return {
        cipher: [
            [BigInt(c1[0]), BigInt(c1[1])],
            [BigInt(c2[0]), BigInt(c2[1])],
        ],
        random: encRandom,
    };
}

/**
 * Decrypt an ElGamal ciphertext
 * @param privateKey User's formatted private key
 * @param c1 First ciphertext component
 * @param c2 Second ciphertext component
 * @returns Decrypted point
 */
export function decryptPoint(
    privateKey: bigint,
    c1: [bigint, bigint],
    c2: [bigint, bigint]
): [bigint, bigint] {
    const formattedKey = formatPrivKeyForBabyJub(privateKey);

    // C1 * sk
    const c1x = mulPointEscalar([c1[0], c1[1]], formattedKey);

    // -C1 * sk
    const c1xInverse: [bigint, bigint] = [Fr.e(c1x[0] * -1n), c1x[1]];

    // M = C2 - C1 * sk
    const result = addPoint([c2[0], c2[1]], c1xInverse);

    return [BigInt(result[0]), BigInt(result[1])];
}

/**
 * Format public key for contract interactions
 */
export function formatPublicKeyForContract(publicKey: [bigint, bigint]): [string, string] {
    return [publicKey[0].toString(), publicKey[1].toString()];
}

/**
 * Format proof points for contract submission
 */
export function formatProofForContract(proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
}): {
    a: [bigint, bigint];
    b: [[bigint, bigint], [bigint, bigint]];
    c: [bigint, bigint];
} {
    return {
        a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
        b: [
            [BigInt(proof.pi_b[0][0]), BigInt(proof.pi_b[0][1])],
            [BigInt(proof.pi_b[1][0]), BigInt(proof.pi_b[1][1])],
        ],
        c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    };
}
