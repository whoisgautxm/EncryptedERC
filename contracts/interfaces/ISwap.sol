// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;


interface ISwap {
    /**
     * @dev Approves a spender to transfer the user's balance.
     * @param approver Address of the user.
     * @param spender Address of the spender.
     * @param operator Address of the operator.
     * @param amountEncryptionData Encrypted amount data.
     * @param amountCommitmentData Commitment data for the amount.
     * @param proofData Proof data for the approval.
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
     * @dev Approves a spender to transfer the user's balance.
     * @param approver Address of the user.
     * @param spender Address of the spender.
     * @param amount Amount to approve.
     * @param newBalanceEncryptionData Encrypted new balance data.
     * @param amountCommitmentData Commitment data for the amount.
     * @param proofData Proof data for the approval.
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
     * @dev Transfers the user's balance from the approver to the spender.
     * @param approver Address of the user.
     * @param spender Address of the spender.
     * @param amountEncryptionData Encrypted amount data.
     * @param amountCommitmentData Commitment data for the amount.
     * @param proofData Proof data for the transfer.
     */
function confidentialTransferFrom(
    address approver,
    address spender,
    bytes calldata amountEncryptionData,
    bytes calldata amountCommitmentData,
    bytes calldata proofData
) external;

/**
     * @dev Transfers the user's balance from the approver to the receiver.
     * @param approver Address of the user.
     * @param receiver Address of the receiver.
     * @param amountEncryptionData Encrypted amount data.
     * @param amountCommitmentData Commitment data for the amount.
     * @param proofData Proof data for the transfer.
     */
function publicConfidentialTransferFrom(
    address approver,
    address receiver,
    bytes calldata amountEncryptionData,
    bytes calldata amountCommitmentData,
    bytes calldata proofData
) external;

/**
     * @dev Cancels the confidential allowance.
     * @param approver Address of the user.
     * @param spender Address of the spender.
     * @param proofData Proof data for the cancellation.
     */
function cancelConfidentialAllowance(
    address approver,
    address spender,
    bytes calldata proofData
) external;

/**
     * @dev Cancels the public confidential allowance.
     * @param approver Address of the user.
     * @param spender Address of the spender.
     * @param balanceEncryptionData Encrypted balance data.
     * @param amountCommitmentData Commitment data for the amount.
     * @param proofData Proof data for the cancellation.
     */
function cancelPublicConfidentialAllowance(
    address approver,
    address spender,
    bytes calldata balanceEncryptionData,
    bytes calldata amountCommitmentData,
    bytes calldata proofData
) external;

/**
     * @dev Initiates an offer.
     * @param assetBuy Address of the asset to buy.
     * @param assetSell Address of the asset to sell.
     * @param rate Rate of the offer.
     * @param maxAmountToSell Maximum amount to sell.
     * @param approveData Approval data for the offer.
     * @return offerId ID of the offer.
     */
function initiateOffer(
    address assetBuy,
    address assetSell,
    uint256 rate,
    uint256 maxAmountToSell,
    bytes calldata approveData
) external returns (uint256 offerId);

/**
     * @dev Accepts an offer.
     * @param offerId ID of the offer.
     * @param approveData Approval data for the offer.
     * @param proofData Proof data for the acceptance.
     */
function acceptOffer(
    uint256 offerId,
    bytes calldata approveData,
    bytes calldata proofData
) external;

/**
     * @dev Finalizes a swap.
     * @param offerId ID of the offer.
     * @param transferFromData Transfer data for the offer.
     * @param proofData Proof data for the finalization.
     */
function finalizeSwap(
    uint256 offerId,
    bytes calldata transferFromData,
    bytes calldata proofData
) external;
}