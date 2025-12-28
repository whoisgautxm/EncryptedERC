// SPDX-License-Identifier: Ecosystem
pragma solidity ^0.8.27;

import {AppStorage, appStorage} from "../diamond/LibAppStorage.sol";
import {Offer, OfferAcceptanceProof, OfferFinalizationProof} from "../types/Types.sol";
import {InvalidProof, UserNotRegistered} from "../errors/Errors.sol";
import {IZexERC} from "../interfaces/IZexERC.sol";

/**
 * @title ZexSwapFacet
 * @notice Diamond facet for swap marketplace operations
 */
contract ZexSwapFacet {
    // ============ Events ============
    event OfferCreated(uint256 indexed offerId, address indexed initiator, address assetBuy, address assetSell, uint256 rate, uint256 maxAmountToSell);
    event OfferAccepted(uint256 indexed offerId, address indexed acceptor);
    event SwapFinalized(uint256 indexed offerId);
    
    // ============ Errors ============
    error InvalidRate();
    error InvalidAmount();
    error OfferNotFound();
    error OfferAlreadyAccepted();
    error NotOfferParticipant();
    error OfferNotAccepted();
    error InsufficientInitiatorAllowance();
    error OfferExpired();
    error ProofRequired();
    error AuditorNotSet();
    
    // ============ Modifiers ============
    modifier onlyIfAuditorSet() {
        AppStorage storage s = appStorage();
        if (s.auditorPublicKey.x == 0 && s.auditorPublicKey.y == 1) revert AuditorNotSet();
        _;
    }
    
    // ============ Functions ============
    
    function initiateOffer(
        address assetBuy,
        address assetSell,
        uint256 rate,
        uint256 maxAmountToSell,
        uint256 minAmountToSell,
        uint256 expiresAt,
        bytes calldata approveData
    ) external onlyIfAuditorSet returns (uint256 offerId) {
        AppStorage storage s = appStorage();
        
        if (!s.registrar.isUserRegistered(msg.sender)) revert UserNotRegistered();
        if (rate == 0) revert InvalidRate();
        if (maxAmountToSell == 0) revert InvalidAmount();
        if (minAmountToSell > maxAmountToSell) revert InvalidAmount();
        
        offerId = s.nextOfferId++;
        
        s.offers[offerId] = Offer({
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
            initiatorApproveData: approveData
        });
        
        emit OfferCreated(offerId, msg.sender, assetBuy, assetSell, rate, maxAmountToSell);
    }
    
    function acceptOffer(uint256 offerId, bytes calldata approveData, bytes calldata proofData) external onlyIfAuditorSet {
        AppStorage storage s = appStorage();
        Offer storage offer = s.offers[offerId];
        
        if (offer.initiator == address(0)) revert OfferNotFound();
        if (offer.acceptor != address(0)) revert OfferAlreadyAccepted();
        if (!s.registrar.isUserRegistered(msg.sender)) revert UserNotRegistered();
        if (offer.expiresAt != 0 && block.timestamp > offer.expiresAt) revert OfferExpired();
        
        // Verify initiator allowance
        if (offer.assetSell != address(0)) {
            (, , bool isPublic, uint256 publicAmount,) = IZexERC(offer.assetSell).getAllowance(offer.initiator, address(this), 0);
            if (!isPublic || publicAmount < offer.maxAmountToSell) revert InsufficientInitiatorAllowance();
        }
        
        OfferAcceptanceProof memory proof = abi.decode(proofData, (OfferAcceptanceProof));
        
        uint256[2] memory acceptorPK = s.registrar.getUserPublicKey(msg.sender);
        require(proof.publicSignals[0] == acceptorPK[0] && proof.publicSignals[1] == acceptorPK[1], "invalid acceptor PK");
        
        uint256[2] memory initiatorPK = s.registrar.getUserPublicKey(offer.initiator);
        require(proof.publicSignals[2] == initiatorPK[0] && proof.publicSignals[3] == initiatorPK[1], "invalid initiator PK");
        require(proof.publicSignals[4] == offer.maxAmountToSell, "max amount mismatch");
        require(proof.publicSignals[5] == offer.rate, "rate mismatch");
        
        if (!s.offerAcceptanceVerifier.verifyProof(proof.proofPoints.a, proof.proofPoints.b, proof.proofPoints.c, proof.publicSignals)) {
            revert InvalidProof();
        }
        
        offer.acceptor = msg.sender;
        offer.amountToBuyCommitmentData = approveData;
        offer.amountToBuyEncryptionData = abi.encode(
            proof.publicSignals[6], proof.publicSignals[7], proof.publicSignals[8], proof.publicSignals[9]
        );
        
        emit OfferAccepted(offerId, msg.sender);
    }
    
    function finalizeSwap(uint256 offerId, bytes calldata transferFromData, bytes calldata proofData) external onlyIfAuditorSet {
        AppStorage storage s = appStorage();
        Offer memory offer = s.offers[offerId];
        
        if (offer.initiator == address(0)) revert OfferNotFound();
        if (offer.acceptor == address(0)) revert OfferNotAccepted();
        if (msg.sender != offer.initiator && msg.sender != offer.acceptor) revert NotOfferParticipant();
        if (proofData.length == 0) revert ProofRequired();
        
        {
            OfferFinalizationProof memory proof = abi.decode(proofData, (OfferFinalizationProof));
            
            uint256[2] memory initiatorPK = s.registrar.getUserPublicKey(offer.initiator);
            require(proof.publicSignals[0] == initiatorPK[0] && proof.publicSignals[1] == initiatorPK[1], "invalid initiator PK");
            
            uint256[2] memory acceptorPK = s.registrar.getUserPublicKey(offer.acceptor);
            require(proof.publicSignals[2] == acceptorPK[0] && proof.publicSignals[3] == acceptorPK[1], "invalid acceptor PK");
            require(proof.publicSignals[4] == offer.rate, "rate mismatch");
            
            (uint256 c1x, uint256 c1y, uint256 c2x, uint256 c2y) = abi.decode(offer.amountToBuyEncryptionData, (uint256, uint256, uint256, uint256));
            require(
                proof.publicSignals[5] == c1x && proof.publicSignals[6] == c1y &&
                proof.publicSignals[7] == c2x && proof.publicSignals[8] == c2y,
                "commitment mismatch"
            );
            
            if (!s.offerFinalizationVerifier.verifyProof(proof.proofPoints.a, proof.proofPoints.b, proof.proofPoints.c, proof.publicSignals)) {
                revert InvalidProof();
            }
        }
        
        delete s.offers[offerId];
        
        if (transferFromData.length == 0) {
            emit SwapFinalized(offerId);
            return;
        }
        
        (bytes memory initiatorToAcceptorData, bytes memory acceptorToInitiatorData) = abi.decode(transferFromData, (bytes, bytes));
        
        if (initiatorToAcceptorData.length > 0 && offer.assetSell != address(0)) {
            (bytes memory amountEncData1, bytes memory amountCommitData1,) = abi.decode(initiatorToAcceptorData, (bytes, bytes, bytes));
            IZexERC(offer.assetSell).publicConfidentialTransferFrom(offer.initiator, offer.acceptor, amountEncData1, amountCommitData1, "");
        }
        
        if (acceptorToInitiatorData.length > 0 && offer.assetBuy != address(0)) {
            (bytes memory amountEncData2, bytes memory amountCommitData2,) = abi.decode(acceptorToInitiatorData, (bytes, bytes, bytes));
            IZexERC(offer.assetBuy).publicConfidentialTransferFrom(offer.acceptor, offer.initiator, amountEncData2, amountCommitData2, "");
        }
        
        emit SwapFinalized(offerId);
    }
    
    // ============ View Functions ============
    
    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return appStorage().offers[offerId];
    }
    
    function nextOfferId() external view returns (uint256) {
        return appStorage().nextOfferId;
    }
}
