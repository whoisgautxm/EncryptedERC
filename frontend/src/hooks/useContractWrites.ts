/**
 * Contract hooks for writing to Registrar and Diamond contracts
 */
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { CONTRACTS } from '../constants';
import { REGISTRAR_ABI, ZEX_SWAP_ABI, ZEX_ALLOWANCE_ABI } from '../lib/abis';
import type { ProofResult } from '../lib/proofs';

/**
 * Register a user with the registrar contract
 */
export function useRegister() {
    const { writeContract, data: hash, isPending, error } = useWriteContract();

    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
        hash,
    });

    const register = async (proofResult: ProofResult) => {
        const { proof, publicSignals } = proofResult;

        // Format for the contract (5 public signals for registration)
        const formattedProof = {
            proofPoints: {
                a: [proof.a[0], proof.a[1]] as [bigint, bigint],
                b: [
                    [proof.b[0][0], proof.b[0][1]] as [bigint, bigint],
                    [proof.b[1][0], proof.b[1][1]] as [bigint, bigint],
                ] as [[bigint, bigint], [bigint, bigint]],
                c: [proof.c[0], proof.c[1]] as [bigint, bigint],
            },
            publicSignals: publicSignals.slice(0, 5) as [bigint, bigint, bigint, bigint, bigint],
        };

        writeContract({
            address: CONTRACTS.REGISTRAR as `0x${string}`,
            abi: REGISTRAR_ABI,
            functionName: 'register',
            args: [formattedProof],
        });
    };

    return {
        register,
        hash,
        isPending,
        isConfirming,
        isSuccess,
        error,
    };
}

/**
 * Create a new offer (initiateOffer)
 */
export function useInitiateOffer(tokenAddress: `0x${string}`) {
    const { writeContract, data: hash, isPending, error } = useWriteContract();

    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
        hash,
    });

    const initiateOffer = async (params: {
        assetBuy: `0x${string}`;
        assetSell: `0x${string}`;
        rate: bigint;
        maxAmountToSell: bigint;
        minAmountToSell: bigint;
        expiresAt: bigint;
        approveData: `0x${string}`;
    }) => {
        writeContract({
            address: tokenAddress,
            abi: ZEX_SWAP_ABI,
            functionName: 'initiateOffer',
            args: [
                params.assetBuy,
                params.assetSell,
                params.rate,
                params.maxAmountToSell,
                params.minAmountToSell,
                params.expiresAt,
                params.approveData,
            ],
        });
    };

    return {
        initiateOffer,
        hash,
        isPending,
        isConfirming,
        isSuccess,
        error,
    };
}

/**
 * Accept an offer with ZK proof
 */
export function useAcceptOffer(tokenAddress: `0x${string}`) {
    const { writeContract, data: hash, isPending, error } = useWriteContract();

    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
        hash,
    });

    const acceptOffer = async (
        offerId: bigint,
        proofResult: ProofResult,
        approveData: `0x${string}` = '0x'
    ) => {
        const { proof, publicSignals } = proofResult;

        // Encode the proof for the contract (OfferAcceptanceProof - 10 public signals)
        const proofData = encodeAbiParameters(
            parseAbiParameters('((uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[10] publicSignals)'),
            [{
                proofPoints: {
                    a: [proof.a[0], proof.a[1]],
                    b: [[proof.b[0][0], proof.b[0][1]], [proof.b[1][0], proof.b[1][1]]],
                    c: [proof.c[0], proof.c[1]],
                },
                publicSignals: publicSignals.slice(0, 10) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
            }]
        );

        writeContract({
            address: tokenAddress,
            abi: ZEX_SWAP_ABI,
            functionName: 'acceptOffer',
            args: [offerId, approveData, proofData],
        });
    };

    return {
        acceptOffer,
        hash,
        isPending,
        isConfirming,
        isSuccess,
        error,
    };
}

/**
 * Finalize a swap with ZK proof
 */
export function useFinalizeSwap(tokenAddress: `0x${string}`) {
    const { writeContract, data: hash, isPending, error } = useWriteContract();

    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
        hash,
    });

    const finalizeSwap = async (
        offerId: bigint,
        proofResult: ProofResult,
        transferFromData: `0x${string}` = '0x'
    ) => {
        const { proof, publicSignals } = proofResult;

        // Encode the proof for the contract (OfferFinalizationProof - 13 public signals)
        const proofData = encodeAbiParameters(
            parseAbiParameters('((uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[13] publicSignals)'),
            [{
                proofPoints: {
                    a: [proof.a[0], proof.a[1]],
                    b: [[proof.b[0][0], proof.b[0][1]], [proof.b[1][0], proof.b[1][1]]],
                    c: [proof.c[0], proof.c[1]],
                },
                publicSignals: publicSignals.slice(0, 13) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
            }]
        );

        writeContract({
            address: tokenAddress,
            abi: ZEX_SWAP_ABI,
            functionName: 'finalizeSwap',
            args: [offerId, transferFromData, proofData],
        });
    };

    return {
        finalizeSwap,
        hash,
        isPending,
        isConfirming,
        isSuccess,
        error,
    };
}

/**
 * Public confidential approve (for setting up allowances)
 */
export function usePublicConfidentialApprove(tokenAddress: `0x${string}`) {
    const { writeContract, data: hash, isPending, error } = useWriteContract();

    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
        hash,
    });

    const approve = async (
        approver: `0x${string}`,
        spender: `0x${string}`,
        amount: bigint
    ) => {
        writeContract({
            address: tokenAddress,
            abi: ZEX_ALLOWANCE_ABI,
            functionName: 'publicConfidentialApprove',
            args: [approver, spender, amount, '0x', '0x', '0x'],
        });
    };

    return {
        approve,
        hash,
        isPending,
        isConfirming,
        isSuccess,
        error,
    };
}
