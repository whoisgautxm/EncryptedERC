// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem
pragma solidity 0.8.27;

import {EGCT, EncryptedAllowance, Offer} from "../types/Types.sol";

/**
 * @title IZexERC
 * @notice Interface for ZexERC confidential allowance functionality
 */
interface IZexERC {
    ///////////////////////////////////////////////////
    ///          Confidential Allowance Functions   ///
    ///////////////////////////////////////////////////
    
    /**
     * @notice Approves tokens confidentially to an EOA
     * @param approver Address of the token holder (must be msg.sender)
     * @param spender Address of the spender (EOA with public key)
     * @param operator Address of the operator (can be same as spender)
     * @param amountEncryptionData Encrypted amount data (EGCT for spender)
     * @param amountCommitmentData Commitment data (PCT for spender to decrypt)
     * @param proofData ZK proof proving validity of approval
     */
    function confidentialApprove(
        address approver,
        address spender,
        address operator,
        bytes calldata amountEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata proofData
    ) external;
    
    /**
     * @notice Approves tokens to a smart contract with public amount
     * @param approver Address of the token holder
     * @param spender Address of the spender contract
     * @param amount Public approval amount (disclosed)
     * @param newBalanceEncryptionData Encrypted new balance for approver
     * @param amountCommitmentData Commitment for the amount
     * @param proofData ZK proof proving approver owns sufficient balance
     */
    function publicConfidentialApprove(
        address approver,
        address spender,
        uint256 amount,
        bytes calldata newBalanceEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata proofData
    ) external;
    
    /**
     * @notice Transfers approved tokens confidentially
     * @param approver Address of the original approver
     * @param spender Address of the spender (must be msg.sender)
     * @param amountEncryptionData Encrypted transfer amount for receiver
     * @param amountCommitmentData Commitment data for the transfer
     * @param proofData ZK proof proving spender can access allowance
     */
    function confidentialTransferFrom(
        address approver,
        address spender,
        bytes calldata amountEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata proofData
    ) external;
    
    /**
     * @notice Transfers from a public confidential allowance
     * @param approver Address of the original approver
     * @param receiver Address of the receiver
     * @param amountEncryptionData Encrypted amount for receiver
     * @param amountCommitmentData Commitment data
     * @param proofData ZK proof for the transfer
     */
    function publicConfidentialTransferFrom(
        address approver,
        address receiver,
        bytes calldata amountEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata proofData
    ) external;
    
    /**
     * @notice Cancels a confidential allowance
     * @param approver Address of the approver (must be msg.sender)
     * @param spender Address of the spender
     * @param proofData Proof of ownership for cancellation
     */
    function cancelConfidentialAllowance(
        address approver,
        address spender,
        bytes calldata proofData
    ) external;
    
    /**
     * @notice Cancels a public confidential allowance
     * @param approver Address of the approver (must be msg.sender)
     * @param spender Address of the spender contract
     * @param balanceEncryptionData Updated balance encryption
     * @param amountCommitmentData Commitment data
     * @param proofData Proof data for cancellation
     */
    function cancelPublicConfidentialAllowance(
        address approver,
        address spender,
        bytes calldata balanceEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata proofData
    ) external;
    
    ///////////////////////////////////////////////////
    ///              Swap Marketplace               ///
    ///////////////////////////////////////////////////
    
    /**
     * @notice Initiates a swap offer
     * @param assetBuy Token address to buy
     * @param assetSell Token address to sell
     * @param rate Exchange rate (scaled by 1e18)
     * @param maxAmountToSell Maximum amount to sell
     * @param approveData Encoded approval data for the sell asset
     * @return offerId The ID of the created offer
     */
    function initiateOffer(
        address assetBuy,
        address assetSell,
        uint256 rate,
        uint256 maxAmountToSell,
        bytes calldata approveData
    ) external returns (uint256 offerId);
    
    /**
     * @notice Accepts a swap offer
     * @param offerId ID of the offer to accept
     * @param approveData Approval data for buy asset
     * @param proofData Proof data for acceptance
     */
    function acceptOffer(
        uint256 offerId,
        bytes calldata approveData,
        bytes calldata proofData
    ) external;
    
    /**
     * @notice Finalizes a swap
     * @param offerId ID of the offer to finalize
     * @param transferFromData Transfer data for the swap
     * @param proofData Proof data for finalization
     */
    function finalizeSwap(
        uint256 offerId,
        bytes calldata transferFromData,
        bytes calldata proofData
    ) external;
    
    ///////////////////////////////////////////////////
    ///                  View Functions             ///
    ///////////////////////////////////////////////////
    
    /**
     * @notice Gets the encrypted allowance for an approver-spender pair
     */
    function getAllowance(
        address approver,
        address spender,
        uint256 tokenId
    ) external view returns (
        EGCT memory encryptedAmount,
        uint256[7] memory amountPCT,
        bool isPublic,
        uint256 publicAmount,
        uint256 nonce
    );
    
    /**
     * @notice Gets an offer by ID
     */
    function getOffer(uint256 offerId) external view returns (Offer memory);
}
