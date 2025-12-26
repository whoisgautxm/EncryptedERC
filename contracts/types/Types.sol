// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem

pragma solidity 0.8.27;

struct Point {
    uint256 x;
    uint256 y;
}

struct CreateEncryptedERCParams {
    // registrar contract address for fetching users public key
    address registrar;
    // eERC is converter mode or not
    bool isConverter;
    // eERC Token
    string name;
    string symbol;
    uint8 decimals;
    // verifiers
    address mintVerifier;
    address withdrawVerifier;
    address transferVerifier;
    address burnVerifier;
}

struct AmountPCT {
    uint256[7] pct;
    uint256 index;
}

struct EncryptedBalance {
    EGCT eGCT;
    mapping(uint256 index => BalanceHistory history) balanceList;
    uint256 nonce;
    uint256 transactionIndex;
    uint256[7] balancePCT; // user balance pcts
    AmountPCT[] amountPCTs; // user amount pcts
}

struct BalanceHistory {
    uint256 index;
    bool isValid;
}

struct EGCT {
    Point c1;
    Point c2;
}

/// @dev The proof base is used to verify the proof
struct ProofPoints {
    uint256[2] a;
    uint256[2][2] b;
    uint256[2] c;
}

struct RegisterProof {
    ProofPoints proofPoints;
    uint256[5] publicSignals;
}

struct MintProof {
    ProofPoints proofPoints;
    uint256[24] publicSignals;
}

struct TransferProof {
    ProofPoints proofPoints;
    uint256[32] publicSignals;
}

struct BurnProof {
    ProofPoints proofPoints;
    uint256[19] publicSignals;
}

struct WithdrawProof {
    ProofPoints proofPoints;
    uint256[16] publicSignals;
}

struct TransferInputs {
    EGCT providedBalance;
    EGCT senderEncryptedAmount;
    EGCT receiverEncryptedAmount;
    uint256[7] amountPCT;
}

struct Metadata {
    address messageFrom;
    address messageTo;
    string messageType;
    bytes encryptedMsg;
}


struct Offer{
    address initiator;
    address acceptor;
    address assetBuy;
    address assetSell;
    uint256 rate;
    uint256 maxAmountToSell;
    bytes amountToBuyEncryptionData;
    bytes amountToBuyCommitmentData;
}

///////////////////////////////////////////////////
///          ZEX Confidential Allowance Types   ///
///////////////////////////////////////////////////

/// @notice Encrypted allowance for confidential approvals
struct EncryptedAllowance {
    EGCT encryptedAmount;        // ElGamal encrypted allowance amount
    uint256[7] amountPCT;        // PCT for the spender to decrypt amount
    bool isPublic;               // Whether this is a public confidential approval
    uint256 publicAmount;        // Only set if isPublic=true
    uint256 nonce;               // Allowance nonce for cancellation tracking
}

/// @notice Proof structure for confidential approve operation
/// Public signals order (30 total):
///   [0-1]   senderPK
///   [2-3]   spenderPK
///   [4-5]   operatorPK
///   [6-9]   senderBalanceC1, senderBalanceC2
///   [10-13] allowanceC1, allowanceC2
///   [14-17] spenderPCT
///   [18-19] spenderPCTAuthKey
///   [20]    spenderPCTNonce
///   [21-22] auditorPK
///   [23-26] auditorPCT
///   [27-28] auditorPCTAuthKey
///   [29]    auditorPCTNonce
struct ConfidentialApproveProof {
    ProofPoints proofPoints;
    uint256[30] publicSignals;
}

/// @notice Proof structure for confidential transferFrom operation
/// Public signals order (34 total):
///   [0-1]   approverPK
///   [2-3]   spenderPK
///   [4-5]   receiverPK
///   [6-9]   allowanceC1, allowanceC2
///   [10-13] newAllowanceC1, newAllowanceC2
///   [14-17] receiverAmountC1, receiverAmountC2
///   [18-21] receiverPCT
///   [22-23] receiverPCTAuthKey
///   [24]    receiverPCTNonce
///   [25-26] auditorPK
///   [27-30] auditorPCT
///   [31-32] auditorPCTAuthKey
///   [33]    auditorPCTNonce
struct ConfidentialTransferFromProof {
    ProofPoints proofPoints;
    uint256[34] publicSignals;
}

/// @notice Proof for cancellation (prove ownership and allowance)
struct CancelAllowanceProof {
    ProofPoints proofPoints;
    uint256[8] publicSignals;   // [approverPK(2), spenderPK(2), allowanceC1(2), allowanceC2(2)]
}

/// @notice Parameters for creating a ZexERC contract
struct CreateZexERCParams {
    CreateEncryptedERCParams baseParams;
    address confidentialApproveVerifier;
    address confidentialTransferFromVerifier;
    address cancelAllowanceVerifier;
}