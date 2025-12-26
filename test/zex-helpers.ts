import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";
import { ethers, zkit } from "hardhat";
import { processPoseidonEncryption, processPoseidonDecryption } from "../src";
import { encryptMessage, decryptPoint } from "../src/jub/jub";
import type { User } from "./user";

// ZEX Circuit Types (will be generated after circuit compilation)
type ConfidentialApproveCircuit = any;
type ConfidentialTransferFromCircuit = any;
type CancelAllowanceCircuit = any;

/**
 * Function for creating a confidential approval
 * @param approver User approving tokens
 * @param approverBalance Current balance
 * @param approverEncryptedBalance Encrypted balance
 * @param spenderPublicKey Spender's public key
 * @param approvalAmount Amount to approve
 * @param auditorPublicKey Auditor's public key
 */
export const confidentialApprove = async (
    approver: User,
    approverBalance: bigint,
    approverEncryptedBalance: bigint[],
    spenderPublicKey: bigint[],
    approvalAmount: bigint,
    auditorPublicKey: bigint[],
): Promise<{
    proof: any;
    encryptedAllowanceData: bigint[];
    spenderPCT: bigint[];
    proofData: string;
    amountEncryptionData: string;
}> => {
    // 1. Encrypt the approval amount for spender (ElGamal)
    const { cipher: encryptedAllowance, random: allowanceRandom } =
        encryptMessage(spenderPublicKey, approvalAmount);

    // 2. Create PCT for spender
    const {
        ciphertext: spenderCiphertext,
        nonce: spenderNonce,
        authKey: spenderAuthKey,
        encRandom: spenderEncRandom,
    } = processPoseidonEncryption([approvalAmount], spenderPublicKey);

    // 3. Create PCT for auditor
    const {
        ciphertext: auditorCiphertext,
        nonce: auditorNonce,
        authKey: auditorAuthKey,
        encRandom: auditorEncRandom,
    } = processPoseidonEncryption([approvalAmount], auditorPublicKey);

    // 4. Get circuit and generate proof
    const circuit = await zkit.getCircuit("ConfidentialApproveCircuit") as unknown as ConfidentialApproveCircuit;

    const input = {
        ApprovalAmount: approvalAmount,
        SenderPrivateKey: approver.formattedPrivateKey,
        SenderBalance: approverBalance,
        AllowanceRandom: allowanceRandom,
        SpenderPCTRandom: spenderEncRandom,
        AuditorPCTRandom: auditorEncRandom,
        SenderPublicKey: approver.publicKey,
        SpenderPublicKey: spenderPublicKey,
        OperatorPublicKey: spenderPublicKey, // Same for EOA
        SenderBalanceC1: approverEncryptedBalance.slice(0, 2),
        SenderBalanceC2: approverEncryptedBalance.slice(2, 4),
        AllowanceC1: encryptedAllowance[0],
        AllowanceC2: encryptedAllowance[1],
        SpenderPCT: spenderCiphertext,
        SpenderPCTAuthKey: spenderAuthKey,
        SpenderPCTNonce: spenderNonce,
        AuditorPublicKey: auditorPublicKey,
        AuditorPCT: auditorCiphertext,
        AuditorPCTAuthKey: auditorAuthKey,
        AuditorPCTNonce: auditorNonce,
    };

    const proof = await circuit.generateProof(input);
    const calldata = await circuit.generateCalldata(proof);

    // Prepare encoded data for contract calls
    const spenderPCT = [...spenderCiphertext, ...spenderAuthKey, spenderNonce];
    const encryptedAllowanceData = [
        encryptedAllowance[0][0], encryptedAllowance[0][1],
        encryptedAllowance[1][0], encryptedAllowance[1][1]
    ];

    // Encode for contract
    const amountEncryptionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[4]", "uint256[7]"],
        [encryptedAllowanceData, spenderPCT]
    );

    const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[28] publicSignals)"],
        [{
            proofPoints: calldata.proofPoints,
            publicSignals: calldata.publicSignals
        }]
    );

    return {
        proof: calldata,
        encryptedAllowanceData,
        spenderPCT,
        proofData,
        amountEncryptionData,
    };
};

/**
 * Function for confidential transferFrom
 * @param spender User spending the allowance
 * @param approverPublicKey Approver's public key
 * @param receiverPublicKey Receiver's public key (often same as spender)
 * @param encryptedAllowance Current encrypted allowance
 * @param allowanceAmount Decrypted allowance amount
 * @param transferAmount Amount to transfer
 * @param auditorPublicKey Auditor's public key
 */
export const confidentialTransferFrom = async (
    spender: User,
    approverPublicKey: bigint[],
    receiverPublicKey: bigint[],
    encryptedAllowance: { c1: bigint[], c2: bigint[] },
    allowanceAmount: bigint,
    transferAmount: bigint,
    auditorPublicKey: bigint[],
): Promise<{
    proof: any;
    newAllowanceData: bigint[];
    receiverAmountData: bigint[];
    receiverPCT: bigint[];
    proofData: string;
    amountEncryptionData: string;
    amountCommitmentData: string;
}> => {
    const remainingAllowance = allowanceAmount - transferAmount;

    // 1. Encrypt new allowance for spender (remaining amount)
    const { cipher: newAllowanceEncrypted, random: newAllowanceRandom } =
        encryptMessage(spender.publicKey, remainingAllowance);

    // 2. Encrypt transfer amount for receiver
    const { cipher: receiverEncrypted, random: receiverRandom } =
        encryptMessage(receiverPublicKey, transferAmount);

    // 3. Create PCT for receiver
    const {
        ciphertext: receiverCiphertext,
        nonce: receiverNonce,
        authKey: receiverAuthKey,
        encRandom: receiverEncRandom,
    } = processPoseidonEncryption([transferAmount], receiverPublicKey);

    // 4. Create PCT for auditor
    const {
        ciphertext: auditorCiphertext,
        nonce: auditorNonce,
        authKey: auditorAuthKey,
        encRandom: auditorEncRandom,
    } = processPoseidonEncryption([transferAmount], auditorPublicKey);

    // 5. Generate proof
    const circuit = await zkit.getCircuit("ConfidentialTransferFromCircuit") as unknown as ConfidentialTransferFromCircuit;

    const input = {
        SpenderPrivateKey: spender.formattedPrivateKey,
        TransferAmount: transferAmount,
        AllowanceAmount: allowanceAmount,
        ReceiverRandom: receiverRandom,
        NewAllowanceRandom: newAllowanceRandom,
        ReceiverPCTRandom: receiverEncRandom,
        AuditorPCTRandom: auditorEncRandom,
        ApproverPublicKey: approverPublicKey,
        SpenderPublicKey: spender.publicKey,
        ReceiverPublicKey: receiverPublicKey,
        AllowanceC1: encryptedAllowance.c1,
        AllowanceC2: encryptedAllowance.c2,
        NewAllowanceC1: newAllowanceEncrypted[0],
        NewAllowanceC2: newAllowanceEncrypted[1],
        ReceiverAmountC1: receiverEncrypted[0],
        ReceiverAmountC2: receiverEncrypted[1],
        ReceiverPCT: receiverCiphertext,
        ReceiverPCTAuthKey: receiverAuthKey,
        ReceiverPCTNonce: receiverNonce,
        AuditorPublicKey: auditorPublicKey,
        AuditorPCT: auditorCiphertext,
        AuditorPCTAuthKey: auditorAuthKey,
        AuditorPCTNonce: auditorNonce,
    };

    const proof = await circuit.generateProof(input);
    const calldata = await circuit.generateCalldata(proof);

    // Prepare encoded data
    const newAllowanceData = [
        newAllowanceEncrypted[0][0], newAllowanceEncrypted[0][1],
        newAllowanceEncrypted[1][0], newAllowanceEncrypted[1][1]
    ];

    const receiverAmountData = [
        receiverEncrypted[0][0], receiverEncrypted[0][1],
        receiverEncrypted[1][0], receiverEncrypted[1][1]
    ];

    const receiverPCT = [...receiverCiphertext, ...receiverAuthKey, receiverNonce];

    // Encode for contract
    const amountEncryptionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[4]", "uint256[4]", "uint256[7]"],
        [newAllowanceData, receiverAmountData, receiverPCT]
    );

    // For commitment data, we'll use the approver's balance PCT (placeholder)
    const approverBalancePCT = [0n, 0n, 0n, 0n, 0n, 0n, 0n];
    const amountCommitmentData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256[7]"],
        [approverBalancePCT]
    );

    const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[34] publicSignals)"],
        [{
            proofPoints: calldata.proofPoints,
            publicSignals: calldata.publicSignals
        }]
    );

    return {
        proof: calldata,
        newAllowanceData,
        receiverAmountData,
        receiverPCT,
        proofData,
        amountEncryptionData,
        amountCommitmentData,
    };
};

/**
 * Function for cancelling a confidential allowance
 * @param approver User cancelling the allowance
 * @param spenderPublicKey Spender's public key
 * @param encryptedAllowance The encrypted allowance to cancel
 */
export const cancelAllowance = async (
    approver: User,
    spenderPublicKey: bigint[],
    encryptedAllowance: { c1: bigint[], c2: bigint[] },
): Promise<{
    proof: any;
    proofData: string;
}> => {
    const circuit = await zkit.getCircuit("CancelAllowanceCircuit") as unknown as CancelAllowanceCircuit;

    const input = {
        ApproverPrivateKey: approver.formattedPrivateKey,
        AllowanceAmount: 0n, // Not used in verification
        ApproverPublicKey: approver.publicKey,
        SpenderPublicKey: spenderPublicKey,
        AllowanceC1: encryptedAllowance.c1,
        AllowanceC2: encryptedAllowance.c2,
    };

    const proof = await circuit.generateProof(input);
    const calldata = await circuit.generateCalldata(proof);

    const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[8] publicSignals)"],
        [{
            proofPoints: calldata.proofPoints,
            publicSignals: calldata.publicSignals
        }]
    );

    return {
        proof: calldata,
        proofData,
    };
};

/**
 * Function for decrypting an encrypted allowance
 * @param privateKey Spender's private key
 * @param pct PCT for the allowance
 * @returns Decrypted allowance amount
 */
export const decryptAllowance = (
    privateKey: bigint,
    pct: bigint[],
): bigint => {
    const ciphertext = pct.slice(0, 4);
    const authKey = pct.slice(4, 6);
    const nonce = pct[6];

    const decrypted = processPoseidonDecryption(
        ciphertext,
        authKey,
        nonce,
        privateKey,
        1
    );

    return BigInt(decrypted[0]);
};
