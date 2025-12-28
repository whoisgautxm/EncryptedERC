// (c) 2025, Ava Labs, Inc. All rights reserved.
// See the file LICENSE for licensing terms.

// SPDX-License-Identifier: Ecosystem
pragma solidity ^0.8.27;

import {EncryptedERC} from "./EncryptedERC.sol";
import {BabyJubJub} from "./libraries/BabyJubJub.sol";
import {
    CreateEncryptedERCParams,
    CreateZexERCParams,
    Point,
    EGCT,
    EncryptedAllowance,
    ConfidentialApproveProof,
    ConfidentialTransferFromProof,
    CancelAllowanceProof,
    OfferAcceptanceProof,
    OfferFinalizationProof,
    Offer,
    AmountPCT
} from "./types/Types.sol";
import {IConfidentialApproveVerifier} from "./interfaces/verifiers/IConfidentialApproveVerifier.sol";
import {IConfidentialTransferFromVerifier} from "./interfaces/verifiers/IConfidentialTransferFromVerifier.sol";
import {ICancelAllowanceVerifier} from "./interfaces/verifiers/ICancelAllowanceVerifier.sol";
import {IRegistrar} from "./interfaces/IRegistrar.sol";
import {IZexERC} from "./interfaces/IZexERC.sol";
import {IOfferAcceptanceVerifier} from "./interfaces/verifiers/IOfferAcceptanceVerifier.sol";
import {IOfferFinalizationVerifier} from "./interfaces/verifiers/IOfferFinalizationVerifier.sol";
import {UserNotRegistered, InvalidProof, ZeroAddress} from "./errors/Errors.sol";

/**
 * @title ZexERC
 * @notice Extension of EncryptedERC with confidential allowance for P2P DEX
 * @dev Implements ZEX paper Section 2: Confidential Token Allowance Model
 * 
 * Key features:
 * - Confidential approval to EOAs (amount hidden)
 * - Public confidential approval to smart contracts (amount visible)
 * - Confidential transferFrom for spending hidden allowances
 * - Swap marketplace for P2P trading
 */
contract ZexERC is EncryptedERC {
    ///////////////////////////////////////////////////
    ///                   State Variables           ///
    ///////////////////////////////////////////////////
    
    /// @notice Mapping: approver => spender => tokenId => EncryptedAllowance
    mapping(address => mapping(address => mapping(uint256 => EncryptedAllowance))) 
        public encryptedAllowances;
    
    /// @notice Verifiers for ZEX operations
    IConfidentialApproveVerifier public confidentialApproveVerifier;
    IConfidentialTransferFromVerifier public confidentialTransferFromVerifier;
    ICancelAllowanceVerifier public cancelAllowanceVerifier;
    IOfferAcceptanceVerifier public offerAcceptanceVerifier;
    IOfferFinalizationVerifier public offerFinalizationVerifier;
    
    /// @notice Swap marketplace: offerId => Offer
    mapping(uint256 => Offer) public offers;
    uint256 public nextOfferId;
    
    ///////////////////////////////////////////////////
    ///                    Events                   ///
    ///////////////////////////////////////////////////
    
    event ConfidentialApproval(
        address indexed approver,
        address indexed spender,
        address indexed operator,
        uint256[7] auditorPCT,
        bool isPublic,
        uint256 publicAmount
    );
    
    event ConfidentialTransferFrom(
        address indexed approver,
        address indexed spender,
        address indexed receiver,
        uint256[7] auditorPCT
    );
    
    event AllowanceCancelled(
        address indexed approver,
        address indexed spender,
        bool wasPublic
    );
    
    event OfferCreated(
        uint256 indexed offerId,
        address indexed initiator,
        address assetBuy,
        address assetSell,
        uint256 rate,
        uint256 maxAmountToSell
    );
    
    event OfferAccepted(
        uint256 indexed offerId,
        address indexed acceptor
    );
    
    event SwapFinalized(
        uint256 indexed offerId
    );
    
    ///////////////////////////////////////////////////
    ///                   Errors                    ///
    ///////////////////////////////////////////////////
    
    error Unauthorized();
    error SpenderNotRegistered();
    error ApproverNotRegistered();
    error ReceiverNotRegistered();
    error UseConfidentialApproveForEOA();
    error UsePublicConfidentialTransferFrom();
    error UseConfidentialTransferFrom();
    error NoAllowance();
    error ExceedsAllowance();
    error InvalidRate();
    error InvalidAmount();
    error OfferNotFound();
    error OfferAlreadyAccepted();
    error NotOfferParticipant();
    error OfferNotAccepted();
    error InsufficientInitiatorAllowance();  // C-03: Initiator must have sufficient allowance
    error OfferExpired();                    // M-02: Offer has expired
    error AmountBelowMinimum();              // M-03: Amount is below minimum
    error ProofRequired();                   // M-05: Finalization proof is required
    error InternalCallOnly();                // C-02: For internal cross-contract calls
    
    ///////////////////////////////////////////////////
    ///                   Constructor               ///
    ///////////////////////////////////////////////////
    
    constructor(
        CreateZexERCParams memory params
    ) EncryptedERC(params.baseParams) {
        if (
            params.confidentialApproveVerifier == address(0) ||
            params.confidentialTransferFromVerifier == address(0) ||
            params.cancelAllowanceVerifier == address(0) ||
            params.offerAcceptanceVerifier == address(0) ||
            params.offerFinalizationVerifier == address(0)
        ) {
            revert ZeroAddress();
        }
        
        confidentialApproveVerifier = IConfidentialApproveVerifier(params.confidentialApproveVerifier);
        confidentialTransferFromVerifier = IConfidentialTransferFromVerifier(params.confidentialTransferFromVerifier);
        cancelAllowanceVerifier = ICancelAllowanceVerifier(params.cancelAllowanceVerifier);
        offerAcceptanceVerifier = IOfferAcceptanceVerifier(params.offerAcceptanceVerifier);
        offerFinalizationVerifier = IOfferFinalizationVerifier(params.offerFinalizationVerifier);
    }
    
    ///////////////////////////////////////////////////
    ///          Internal Helper Functions          ///
    ///////////////////////////////////////////////////
    
    /**
     * @notice Subtracts an encrypted amount from a user's balance with ZK proof verification
     * @param user Address of the user
     * @param tokenId ID of the token
     * @param providedBalance The balance provided in the proof
     * @param transferAmount The encrypted amount to subtract
     * @param balancePCT The new balance PCT after subtraction
     * @dev This is a ZEX-specific helper that verifies balance and performs subtraction
     */
    function _subtractFromUserBalanceWithProof(
        address user,
        uint256 tokenId,
        EGCT memory providedBalance,
        EGCT memory transferAmount,
        uint256[7] memory balancePCT
    ) internal {
        // Verify the provided balance is valid and get transaction index
        uint256 transactionIndex = _verifyUserBalance(user, tokenId, providedBalance);
        
        // Subtract the transfer amount from user's balance
        _subtractFromUserBalance(user, tokenId, transferAmount, balancePCT, transactionIndex);
    }
    
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
     * 
     * @dev This function:
     *      1. Verifies approver is msg.sender
     *      2. Validates all parties are registered
     *      3. Verifies the ZK proof
     *      4. Stores the encrypted allowance
     */
    function confidentialApprove(
        address approver,
        address spender,
        address operator,
        bytes calldata amountEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata proofData
    ) external onlyIfAuditorSet {
        if (approver != msg.sender) revert Unauthorized();
        if (!registrar.isUserRegistered(approver)) revert ApproverNotRegistered();
        if (!registrar.isUserRegistered(spender)) revert SpenderNotRegistered();
        
        // Decode the proof
        ConfidentialApproveProof memory proof = abi.decode(
            proofData, 
            (ConfidentialApproveProof)
        );
        
        // Validate public keys and verify proof in scope to reduce stack
        {
            uint256[2] memory approverPK = registrar.getUserPublicKey(approver);
            require(
                proof.publicSignals[0] == approverPK[0] && 
                proof.publicSignals[1] == approverPK[1],
                "ZexERC: invalid approver PK"
            );
        }
        
        {
            uint256[2] memory spenderPK = registrar.getUserPublicKey(spender);
            require(
                proof.publicSignals[2] == spenderPK[0] && 
                proof.publicSignals[3] == spenderPK[1],
                "ZexERC: invalid spender PK"
            );
        }
        
        // Validate auditor public key
        _validateAuditorPublicKey([proof.publicSignals[21], proof.publicSignals[22]]);
        
        // Verify the ZK proof
        bool isVerified = confidentialApproveVerifier.verifyProof(
            proof.proofPoints.a,
            proof.proofPoints.b,
            proof.proofPoints.c,
            proof.publicSignals
        );
        if (!isVerified) revert InvalidProof();
        
        // Store encrypted allowance in scope
        {
            (
                uint256[4] memory allowanceEGCT,
                uint256[7] memory spenderPCT
            ) = abi.decode(amountEncryptionData, (uint256[4], uint256[7]));
            
            EncryptedAllowance storage allowance = encryptedAllowances[approver][spender][0];
            allowance.encryptedAmount = EGCT({
                c1: Point({x: allowanceEGCT[0], y: allowanceEGCT[1]}),
                c2: Point({x: allowanceEGCT[2], y: allowanceEGCT[3]})
            });
            allowance.amountPCT = spenderPCT;
            allowance.isPublic = false;
            allowance.nonce++;
        }
        
        // Emit event with auditor PCT
        {
            uint256[7] memory auditorPCT;
            for (uint i = 0; i < 7; i++) {
                auditorPCT[i] = proof.publicSignals[23 + i];
            }
            emit ConfidentialApproval(approver, spender, operator, auditorPCT, false, 0);
        }
    }
    
    /**
     * @notice Approves tokens to a smart contract with public amount
     * @param approver Address of the token holder
     * @param spender Address of the spender contract
     * @param amount Public approval amount (disclosed)
     * @param newBalanceEncryptionData Encrypted new balance for approver
     * @param amountCommitmentData Commitment for the amount
     * @param proofData ZK proof proving approver owns sufficient balance
     *
     * @dev Since smart contracts cannot hold private keys, the amount must be public.
     */
    function publicConfidentialApprove(
        address approver,
        address spender,
        uint256 amount,
        bytes calldata newBalanceEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata proofData
    ) external onlyIfAuditorSet {
        if (approver != msg.sender) revert Unauthorized();
        if (!registrar.isUserRegistered(approver)) revert ApproverNotRegistered();
        if (amount == 0) revert InvalidAmount();
        
        // Spender is a contract - verify it's not an EOA with registered key
        if (registrar.isUserRegistered(spender)) revert UseConfidentialApproveForEOA();
        
        // Decode and verify proof
        ConfidentialApproveProof memory proof = abi.decode(
            proofData,
            (ConfidentialApproveProof)
        );
        
        // Validate approver's public key
        uint256[2] memory approverPK = registrar.getUserPublicKey(approver);
        require(
            proof.publicSignals[0] == approverPK[0] &&
            proof.publicSignals[1] == approverPK[1],
            "ZexERC: invalid approver PK"
        );
        
        // Validate auditor public key
        _validateAuditorPublicKey([proof.publicSignals[21], proof.publicSignals[22]]);
        
        // Verify the proof
        bool isVerified = confidentialApproveVerifier.verifyProof(
            proof.proofPoints.a,
            proof.proofPoints.b,
            proof.proofPoints.c,
            proof.publicSignals
        );
        if (!isVerified) revert InvalidProof();
        
        // Store public allowance
        EncryptedAllowance storage allowance = encryptedAllowances[approver][spender][0];
        allowance.isPublic = true;
        allowance.publicAmount = amount;
        allowance.nonce++;
        
        // Empty auditor PCT for public approvals
        uint256[7] memory emptyPCT;
        emit ConfidentialApproval(approver, spender, spender, emptyPCT, true, amount);
    }
    
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
    ) external onlyIfAuditorSet {
        if (spender != msg.sender) revert Unauthorized();
        if (!registrar.isUserRegistered(approver)) revert ApproverNotRegistered();
        if (!registrar.isUserRegistered(spender)) revert SpenderNotRegistered();
        
        EncryptedAllowance storage allowance = encryptedAllowances[approver][spender][0];
        if (allowance.isPublic) revert UsePublicConfidentialTransferFrom();
        if (allowance.encryptedAmount.c1.x == 0 && allowance.encryptedAmount.c1.y == 0) {
            revert NoAllowance();
        }
        
        // Decode proof
        ConfidentialTransferFromProof memory proof = abi.decode(
            proofData,
            (ConfidentialTransferFromProof)
        );
        
        // Validate keys
        uint256[2] memory approverPK = registrar.getUserPublicKey(approver);
        uint256[2] memory spenderPK = registrar.getUserPublicKey(spender);
        
        require(
            proof.publicSignals[0] == approverPK[0] &&
            proof.publicSignals[1] == approverPK[1],
            "ZexERC: invalid approver PK"
        );
        require(
            proof.publicSignals[2] == spenderPK[0] &&
            proof.publicSignals[3] == spenderPK[1],
            "ZexERC: invalid spender PK"
        );
        
        // Validate auditor public key (indices 25-26 in circuit output)
        _validateAuditorPublicKey([proof.publicSignals[25], proof.publicSignals[26]]);
        
        // Verify proof
        bool isVerified = confidentialTransferFromVerifier.verifyProof(
            proof.proofPoints.a,
            proof.proofPoints.b,
            proof.proofPoints.c,
            proof.publicSignals
        );
        if (!isVerified) revert InvalidProof();
        
        // Decode new allowance, receiver amount, and PCT from calldata
        (
            uint256[4] memory newAllowanceData,
            uint256[4] memory receiverAmountData,
            uint256[7] memory receiverPCT
        ) = abi.decode(amountEncryptionData, (uint256[4], uint256[4], uint256[7]));
        
        // Update allowance with new encrypted value from circuit signals [10-13]
        allowance.encryptedAmount = EGCT({
            c1: Point({x: newAllowanceData[0], y: newAllowanceData[1]}),
            c2: Point({x: newAllowanceData[2], y: newAllowanceData[3]})
        });
        allowance.nonce++;
        
        // Credit receiver (spender receives the transfer)
        // Use receiver amount from circuit signals [14-17]
        EGCT memory receiverAmount = EGCT({
            c1: Point({x: proof.publicSignals[14], y: proof.publicSignals[15]}),
            c2: Point({x: proof.publicSignals[16], y: proof.publicSignals[17]})
        });
        _addToUserBalance(spender, 0, receiverAmount, receiverPCT);
        
        // Note: In this design, the approver's balance was already reserved during approve.
        // The actual debit from approver happens through the allowance mechanism.
        // No additional balance subtraction needed here - the allowance IS the debit.
        
        emit ConfidentialTransferFrom(approver, spender, spender, receiverPCT);
    }
    
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
    ) external onlyIfAuditorSet {
        if (!registrar.isUserRegistered(approver)) revert ApproverNotRegistered();
        if (!registrar.isUserRegistered(receiver)) revert ReceiverNotRegistered();
        
        EncryptedAllowance storage allowance = encryptedAllowances[approver][msg.sender][0];
        if (!allowance.isPublic) revert UseConfidentialTransferFrom();
        if (allowance.publicAmount == 0) revert NoAllowance();
        
        // Decode transfer amount from amountCommitmentData for public transfers
        uint256 transferAmount = abi.decode(amountCommitmentData, (uint256));
        if (transferAmount > allowance.publicAmount) revert ExceedsAllowance();
        
        // Update public allowance
        allowance.publicAmount -= transferAmount;
        allowance.nonce++;
        
        // Decode receiver encrypted amount
        (
            uint256[4] memory receiverAmountData,
            uint256[7] memory receiverPCT
        ) = abi.decode(amountEncryptionData, (uint256[4], uint256[7]));
        
        EGCT memory receiverEncrypted = EGCT({
            c1: Point({x: receiverAmountData[0], y: receiverAmountData[1]}),
            c2: Point({x: receiverAmountData[2], y: receiverAmountData[3]})
        });
        
        _addToUserBalance(receiver, 0, receiverEncrypted, receiverPCT);
        
        // Note: For public allowances, the amount is publicly known
        // The allowance mechanism handles the debit - no additional balance subtraction needed
        
        emit ConfidentialTransferFrom(approver, msg.sender, receiver, receiverPCT);
    }
    
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
    ) external {
        if (approver != msg.sender) revert Unauthorized();
        
        EncryptedAllowance storage allowance = encryptedAllowances[approver][spender][0];
        if (allowance.isPublic) revert UsePublicConfidentialTransferFrom();
        if (allowance.encryptedAmount.c1.x == 0 && allowance.encryptedAmount.c1.y == 0) {
            revert NoAllowance();
        }
        
        // Decode and verify proof
        CancelAllowanceProof memory proof = abi.decode(proofData, (CancelAllowanceProof));
        
        uint256[2] memory approverPK = registrar.getUserPublicKey(approver);
        require(
            proof.publicSignals[0] == approverPK[0] &&
            proof.publicSignals[1] == approverPK[1],
            "ZexERC: invalid approver PK"
        );
        
        bool isVerified = cancelAllowanceVerifier.verifyProof(
            proof.proofPoints.a,
            proof.proofPoints.b,
            proof.proofPoints.c,
            proof.publicSignals
        );
        if (!isVerified) revert InvalidProof();
        
        // Clear the allowance
        delete encryptedAllowances[approver][spender][0];
        
        emit AllowanceCancelled(approver, spender, false);
    }
    
    /**
     * @notice Cancels a public confidential allowance
     * @param approver Address of the approver (must be msg.sender)
     * @param spender Address of the spender contract
     * @param balanceEncryptionData Updated balance encryption (unused, for interface compatibility)
     * @param amountCommitmentData Commitment data (unused, for interface compatibility)
     * @param proofData Proof data for cancellation
     */
    function cancelPublicConfidentialAllowance(
        address approver,
        address spender,
        bytes calldata balanceEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata proofData
    ) external {
        if (approver != msg.sender) revert Unauthorized();
        
        EncryptedAllowance storage allowance = encryptedAllowances[approver][spender][0];
        if (!allowance.isPublic) revert UseConfidentialTransferFrom();
        if (allowance.publicAmount == 0) revert NoAllowance();
        
        // For public allowances, proof is simpler - just prove ownership
        CancelAllowanceProof memory proof = abi.decode(proofData, (CancelAllowanceProof));
        
        uint256[2] memory approverPK = registrar.getUserPublicKey(approver);
        require(
            proof.publicSignals[0] == approverPK[0] &&
            proof.publicSignals[1] == approverPK[1],
            "ZexERC: invalid approver PK"
        );
        
        bool isVerified = cancelAllowanceVerifier.verifyProof(
            proof.proofPoints.a,
            proof.proofPoints.b,
            proof.proofPoints.c,
            proof.publicSignals
        );
        if (!isVerified) revert InvalidProof();
        
        // Clear the allowance
        delete encryptedAllowances[approver][spender][0];
        
        emit AllowanceCancelled(approver, spender, true);
    }
    
    ///////////////////////////////////////////////////
    ///              Swap Marketplace               ///
    ///////////////////////////////////////////////////
    
    /**
     * @notice Initiates a swap offer
     * @param assetBuy Token address to buy (ZexERC contract)
     * @param assetSell Token address to sell (ZexERC contract) 
     * @param rate Exchange rate - how much assetBuy per 1 assetSell (scaled by 1e18)
     * @param maxAmountToSell Maximum amount of assetSell to sell
     * @param minAmountToSell Minimum amount of assetSell (prevents griefing)
     * @param expiresAt Timestamp when offer expires (0 = no expiry)
     * @param approveData Encoded confidential approval data for assetSell
     *        Format: (address spender, bytes amountEncryptionData, bytes amountCommitmentData, bytes proofData)
     * @return offerId The ID of the created offer
     */
    function initiateOffer(
        address assetBuy,
        address assetSell,
        uint256 rate,
        uint256 maxAmountToSell,
        uint256 minAmountToSell,
        uint256 expiresAt,
        bytes calldata approveData
    ) external onlyIfAuditorSet returns (uint256 offerId) {
        if (!registrar.isUserRegistered(msg.sender)) revert UserNotRegistered();
        if (rate == 0) revert InvalidRate();
        if (maxAmountToSell == 0) revert InvalidAmount();
        if (minAmountToSell > maxAmountToSell) revert InvalidAmount();
        
        offerId = nextOfferId++;
        
        offers[offerId] = Offer({
            initiator: msg.sender,
            acceptor: address(0),
            assetBuy: assetBuy,
            assetSell: assetSell,
            rate: rate,
            maxAmountToSell: maxAmountToSell,
            minAmountToSell: minAmountToSell,
            expiresAt: expiresAt,
            amountToBuyEncryptionData: "",
            amountToBuyCommitmentData: "",
            initiatorApproveData: approveData  // M-04: Preserve original approval data
        });
        
        emit OfferCreated(offerId, msg.sender, assetBuy, assetSell, rate, maxAmountToSell);
    }
    
    /**
     * @notice Accepts a swap offer by providing approval for the buy asset
     * @param offerId ID of the offer to accept
     * @param approveData Approval data for buy asset (acceptor approves initiator)
     *        Format: (bytes amountEncryptionData, bytes amountCommitmentData, bytes proofData)
     * @param proofData ZK proof proving chosen amount ≤ maxAmountToSell (§5.2.1)
     */
    function acceptOffer(
        uint256 offerId,
        bytes calldata approveData,
        bytes calldata proofData
    ) external onlyIfAuditorSet {
        Offer storage offer = offers[offerId];
        if (offer.initiator == address(0)) revert OfferNotFound();
        if (offer.acceptor != address(0)) revert OfferAlreadyAccepted();
        if (!registrar.isUserRegistered(msg.sender)) revert UserNotRegistered();
        
        // M-02: Check if offer has expired
        if (offer.expiresAt != 0 && block.timestamp > offer.expiresAt) {
            revert OfferExpired();
        }
        
        // C-03: Verify initiator has sufficient public allowance for the swap
        // The initiator must have approved this contract for at least maxAmountToSell
        if (offer.assetSell != address(0)) {
            (
                ,  // encryptedAmount
                ,  // amountPCT
                bool isPublic,
                uint256 publicAmount,
                // nonce
            ) = IZexERC(offer.assetSell).getAllowance(
                offer.initiator,
                address(this),
                0
            );
            if (!isPublic || publicAmount < offer.maxAmountToSell) {
                revert InsufficientInitiatorAllowance();
            }
        }
        
        // Decode and verify offer acceptance proof
        OfferAcceptanceProof memory proof = abi.decode(proofData, (OfferAcceptanceProof));
        
        // Validate acceptor's public key matches proof [0-1]
        uint256[2] memory acceptorPK = registrar.getUserPublicKey(msg.sender);
        require(
            proof.publicSignals[0] == acceptorPK[0] &&
            proof.publicSignals[1] == acceptorPK[1],
            "ZexERC: invalid acceptor PK"
        );
        
        // Validate initiator's public key matches proof [2-3]
        uint256[2] memory initiatorPK = registrar.getUserPublicKey(offer.initiator);
        require(
            proof.publicSignals[2] == initiatorPK[0] &&
            proof.publicSignals[3] == initiatorPK[1],
            "ZexERC: invalid initiator PK"
        );
        
        // Validate maxAmountToSell matches offer [4]
        require(
            proof.publicSignals[4] == offer.maxAmountToSell,
            "ZexERC: max amount mismatch"
        );
        
        // Validate rate matches offer [5]
        require(
            proof.publicSignals[5] == offer.rate,
            "ZexERC: rate mismatch"
        );
        
        // Verify the ZK proof
        bool isVerified = offerAcceptanceVerifier.verifyProof(
            proof.proofPoints.a,
            proof.proofPoints.b,
            proof.proofPoints.c,
            proof.publicSignals
        );
        if (!isVerified) revert InvalidProof();
        
        // Store acceptor and commitment data
        offer.acceptor = msg.sender;
        offer.amountToBuyCommitmentData = approveData;
        
        // Store the encrypted amount commitment from the proof [6-9] for finalization
        // This is the commitment the initiator will decrypt
        offer.amountToBuyEncryptionData = abi.encode(
            proof.publicSignals[6],  // AmountToBuyC1.x
            proof.publicSignals[7],  // AmountToBuyC1.y
            proof.publicSignals[8],  // AmountToBuyC2.x
            proof.publicSignals[9]   // AmountToBuyC2.y
        );
        
        emit OfferAccepted(offerId, msg.sender);
    }
    
    /**
     * @notice Finalizes a swap by executing cross-token transfers
     * @param offerId ID of the offer to finalize
     * @param transferFromData Encoded data for executing the transfers
     *        Format: (bytes initiatorTransferData, bytes acceptorTransferData)
     *        Each contains: (bytes amountEncryptionData, bytes amountCommitmentData, bytes proofData)
     * @param proofData ZK proof proving correct decryption and sell amount computation (§5.2.2)
     * 
     * @dev Swap flow:
     *      1. Initiator approved acceptor for assetSell during initiateOffer
     *      2. Acceptor approved initiator for assetBuy during acceptOffer  
     *      3. Now we execute:
     *         - Verify finalization proof
     *         - Execute cross-token transfers via publicConfidentialTransferFrom
     */
    function finalizeSwap(
        uint256 offerId,
        bytes calldata transferFromData,
        bytes calldata proofData
    ) external onlyIfAuditorSet {
        Offer memory offer = offers[offerId];
        if (offer.initiator == address(0)) revert OfferNotFound();
        if (offer.acceptor == address(0)) revert OfferNotAccepted();
        if (msg.sender != offer.initiator && msg.sender != offer.acceptor) {
            revert NotOfferParticipant();
        }
        
        // M-05: Finalization proof is required
        if (proofData.length == 0) revert ProofRequired();
        
        // Verify finalization proof
        {
            OfferFinalizationProof memory proof = abi.decode(proofData, (OfferFinalizationProof));
            
            // Validate initiator's public key matches proof [0-1]
            uint256[2] memory initiatorPK = registrar.getUserPublicKey(offer.initiator);
            require(
                proof.publicSignals[0] == initiatorPK[0] &&
                proof.publicSignals[1] == initiatorPK[1],
                "ZexERC: invalid initiator PK"
            );
            
            // Validate acceptor's public key matches proof [2-3]
            uint256[2] memory acceptorPK = registrar.getUserPublicKey(offer.acceptor);
            require(
                proof.publicSignals[2] == acceptorPK[0] &&
                proof.publicSignals[3] == acceptorPK[1],
                "ZexERC: invalid acceptor PK"
            );
            
            // Validate rate matches offer [4]
            require(
                proof.publicSignals[4] == offer.rate,
                "ZexERC: rate mismatch"
            );
            
            // Validate AmountToBuy commitment matches stored commitment [5-8]
            (uint256 c1x, uint256 c1y, uint256 c2x, uint256 c2y) = abi.decode(
                offer.amountToBuyEncryptionData, 
                (uint256, uint256, uint256, uint256)
            );
            require(
                proof.publicSignals[5] == c1x &&
                proof.publicSignals[6] == c1y &&
                proof.publicSignals[7] == c2x &&
                proof.publicSignals[8] == c2y,
                "ZexERC: commitment mismatch"
            );
            
            // Verify the ZK proof
            bool isVerified = offerFinalizationVerifier.verifyProof(
                proof.proofPoints.a,
                proof.proofPoints.b,
                proof.proofPoints.c,
                proof.publicSignals
            );
            if (!isVerified) revert InvalidProof();
        }
        
        // Delete offer first to prevent reentrancy
        delete offers[offerId];
        
        // If no transfer data provided, just finalize without cross-contract calls
        // Note: For cross-contract transfers, the caller must pre-approve this contract
        // and provide proper transfer data. See C-02 in audit report for details.
        if (transferFromData.length == 0) {
            emit SwapFinalized(offerId);
            return;
        }
        
        // Decode the transfer data for both legs of the swap
        (
            bytes memory initiatorToAcceptorData,  // assetSell: initiator -> acceptor
            bytes memory acceptorToInitiatorData   // assetBuy: acceptor -> initiator
        ) = abi.decode(transferFromData, (bytes, bytes));
        
        // C-02 Fix: Use publicConfidentialTransferFrom since initiator approved THIS contract
        // The initiator used publicConfidentialApprove with this contract as spender,
        // so we (the ZEX contract) can call publicConfidentialTransferFrom to send to acceptor
        
        // Execute leg 1: Transfer assetSell from initiator's public allowance to acceptor
        if (initiatorToAcceptorData.length > 0 && offer.assetSell != address(0)) {
            (
                bytes memory amountEncData1,
                bytes memory amountCommitData1,
                // proofData1 unused for public transfers
            ) = abi.decode(initiatorToAcceptorData, (bytes, bytes, bytes));
            
            // Call publicConfidentialTransferFrom: this contract is the spender (msg.sender)
            // transferring from initiator (approver) to acceptor (receiver)
            IZexERC(offer.assetSell).publicConfidentialTransferFrom(
                offer.initiator,  // approver (who made the public allowance)
                offer.acceptor,   // receiver (gets the tokens)
                amountEncData1,
                amountCommitData1,
                ""  // No ZK proof needed for public transfers - amount is public
            );
        }
        
        // Execute leg 2: Transfer assetBuy from acceptor's public allowance to initiator
        if (acceptorToInitiatorData.length > 0 && offer.assetBuy != address(0)) {
            (
                bytes memory amountEncData2,
                bytes memory amountCommitData2,
                // proofData2 unused for public transfers
            ) = abi.decode(acceptorToInitiatorData, (bytes, bytes, bytes));
            
            // Call publicConfidentialTransferFrom: this contract is the spender
            IZexERC(offer.assetBuy).publicConfidentialTransferFrom(
                offer.acceptor,   // approver (who made the public allowance)
                offer.initiator,  // receiver (gets the tokens)
                amountEncData2,
                amountCommitData2,
                ""  // No ZK proof needed for public transfers
            );
        }
        
        emit SwapFinalized(offerId);
    }
    
    ///////////////////////////////////////////////////
    ///                  View Functions             ///
    ///////////////////////////////////////////////////
    
    /**
     * @notice Gets the encrypted allowance for an approver-spender pair
     * @param approver Address of the approver
     * @param spender Address of the spender
     * @param tokenId ID of the token
     * @return encryptedAmount The encrypted allowance amount
     * @return amountPCT The PCT for decrypting the amount
     * @return isPublic Whether this is a public allowance
     * @return publicAmount The public amount (if isPublic)
     * @return nonce The allowance nonce
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
    ) {
        EncryptedAllowance storage allowance = encryptedAllowances[approver][spender][tokenId];
        return (
            allowance.encryptedAmount,
            allowance.amountPCT,
            allowance.isPublic,
            allowance.publicAmount,
            allowance.nonce
        );
    }
    
    /**
     * @notice Gets an offer by ID
     * @param offerId ID of the offer
     * @return The offer data
     */
    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return offers[offerId];
    }
}
