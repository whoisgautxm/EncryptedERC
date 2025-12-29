/**
 * Contract hooks for reading data from Registrar and Diamond contracts
 */
import { useReadContract, useReadContracts } from 'wagmi';
import { CONTRACTS } from '../constants';
import { REGISTRAR_ABI, ZEX_SWAP_ABI, ZEX_TOKEN_ABI, ZEX_ALLOWANCE_ABI } from '../lib/abis';
import type { Offer } from '../types';

/**
 * Check if a user is registered
 */
export function useIsRegistered(address: `0x${string}` | undefined) {
    return useReadContract({
        address: CONTRACTS.REGISTRAR as `0x${string}`,
        abi: REGISTRAR_ABI,
        functionName: 'isUserRegistered',
        args: address ? [address] : undefined,
        query: {
            enabled: !!address,
        },
    });
}

/**
 * Get user's public key from registrar
 */
export function useUserPublicKey(address: `0x${string}` | undefined) {
    return useReadContract({
        address: CONTRACTS.REGISTRAR as `0x${string}`,
        abi: REGISTRAR_ABI,
        functionName: 'getUserPublicKey',
        args: address ? [address] : undefined,
        query: {
            enabled: !!address,
        },
    });
}

/**
 * Get a single offer by ID
 */
export function useOffer(offerId: bigint | undefined, tokenAddress: `0x${string}`) {
    return useReadContract({
        address: tokenAddress,
        abi: ZEX_SWAP_ABI,
        functionName: 'getOffer',
        args: offerId !== undefined ? [offerId] : undefined,
        query: {
            enabled: offerId !== undefined,
        },
    });
}

/**
 * Get the next offer ID (total number of offers)
 */
export function useNextOfferId(tokenAddress: `0x${string}`) {
    return useReadContract({
        address: tokenAddress,
        abi: ZEX_SWAP_ABI,
        functionName: 'nextOfferId',
    });
}

/**
 * Get token info (name, symbol, decimals)
 */
export function useTokenInfo(tokenAddress: `0x${string}` | undefined) {
    return useReadContracts({
        contracts: tokenAddress ? [
            {
                address: tokenAddress,
                abi: ZEX_TOKEN_ABI,
                functionName: 'name',
            },
            {
                address: tokenAddress,
                abi: ZEX_TOKEN_ABI,
                functionName: 'symbol',
            },
            {
                address: tokenAddress,
                abi: ZEX_TOKEN_ABI,
                functionName: 'decimals',
            },
        ] : [],
        query: {
            enabled: !!tokenAddress,
        },
    });
}

/**
 * Get user's encrypted balance
 */
export function useEncryptedBalance(tokenAddress: `0x${string}` | undefined, userAddress: `0x${string}` | undefined) {
    return useReadContract({
        address: tokenAddress,
        abi: ZEX_TOKEN_ABI,
        functionName: 'balanceOfStandalone',
        args: userAddress ? [userAddress] : undefined,
        query: {
            enabled: !!tokenAddress && !!userAddress,
        },
    });
}

/**
 * Check if auditor key is set for a token
 */
export function useIsAuditorKeySet(tokenAddress: `0x${string}` | undefined) {
    return useReadContract({
        address: tokenAddress,
        abi: ZEX_TOKEN_ABI,
        functionName: 'isAuditorKeySet',
        query: {
            enabled: !!tokenAddress,
        },
    });
}

/**
 * Get allowance between approver and spender
 */
export function useAllowance(
    tokenAddress: `0x${string}` | undefined,
    approver: `0x${string}` | undefined,
    spender: `0x${string}` | undefined
) {
    return useReadContract({
        address: tokenAddress,
        abi: ZEX_ALLOWANCE_ABI,
        functionName: 'getAllowance',
        args: approver && spender ? [approver, spender, 0n] : undefined,
        query: {
            enabled: !!tokenAddress && !!approver && !!spender,
        },
    });
}
