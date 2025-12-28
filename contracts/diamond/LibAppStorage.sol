// SPDX-License-Identifier: Ecosystem
pragma solidity ^0.8.27;

import {
    Point,
    EGCT,
    EncryptedBalance,
    EncryptedAllowance,
    Offer
} from "../types/Types.sol";
import {IRegistrar} from "../interfaces/IRegistrar.sol";
import {IMintVerifier} from "../interfaces/verifiers/IMintVerifier.sol";
import {IWithdrawVerifier} from "../interfaces/verifiers/IWithdrawVerifier.sol";
import {ITransferVerifier} from "../interfaces/verifiers/ITransferVerifier.sol";
import {IBurnVerifier} from "../interfaces/verifiers/IBurnVerifier.sol";
import {IConfidentialApproveVerifier} from "../interfaces/verifiers/IConfidentialApproveVerifier.sol";
import {IConfidentialTransferFromVerifier} from "../interfaces/verifiers/IConfidentialTransferFromVerifier.sol";
import {ICancelAllowanceVerifier} from "../interfaces/verifiers/ICancelAllowanceVerifier.sol";
import {IOfferAcceptanceVerifier} from "../interfaces/verifiers/IOfferAcceptanceVerifier.sol";
import {IOfferFinalizationVerifier} from "../interfaces/verifiers/IOfferFinalizationVerifier.sol";

// Diamond storage slot
bytes32 constant APP_STORAGE_POSITION = keccak256("zex.diamond.app.storage");

/**
 * @notice Application storage struct - shared across all facets
 */
struct AppStorage {
    // ============ Token Metadata ============
    string name;
    string symbol;
    uint8 decimals;
    bool isConverter;
    
    // ============ Core Contracts ============
    IRegistrar registrar;
    
    // ============ Verifiers ============
    IMintVerifier mintVerifier;
    IWithdrawVerifier withdrawVerifier;
    ITransferVerifier transferVerifier;
    IBurnVerifier burnVerifier;
    IConfidentialApproveVerifier confidentialApproveVerifier;
    IConfidentialTransferFromVerifier confidentialTransferFromVerifier;
    ICancelAllowanceVerifier cancelAllowanceVerifier;
    IOfferAcceptanceVerifier offerAcceptanceVerifier;
    IOfferFinalizationVerifier offerFinalizationVerifier;
    
    // ============ Auditor ============
    Point auditorPublicKey;
    address auditorSetter;
    
    // ============ User Balances ============
    mapping(address => mapping(uint256 => EncryptedBalance)) balances;
    
    // ============ Token Tracker ============
    mapping(uint256 => address) tokenIdToAddress;
    mapping(address => uint256) addressToTokenId;
    uint256 nextTokenId;
    
    // ============ Nullifiers ============
    mapping(uint256 => bool) alreadyMinted;
    
    // ============ Total Supply ============
    mapping(uint256 => uint256) totalSupply;
    
    // ============ Allowances (ZexERC) ============
    mapping(address => mapping(address => mapping(uint256 => EncryptedAllowance))) encryptedAllowances;
    
    // ============ Swap Marketplace (ZexERC) ============
    mapping(uint256 => Offer) offers;
    uint256 nextOfferId;
}

/**
 * @notice Access the diamond storage
 */
function appStorage() pure returns (AppStorage storage s) {
    bytes32 position = APP_STORAGE_POSITION;
    assembly {
        s.slot := position
    }
}

/**
 * @title Modifiers
 * @notice Shared modifiers for all facets
 */
library LibAppStorageModifiers {
    error AuditorNotSet();
    error Unauthorized();
    error UserNotRegistered();
    
    function enforceAuditorSet(AppStorage storage s) internal view {
        if (s.auditorPublicKey.x == 0 && s.auditorPublicKey.y == 1) {
            revert AuditorNotSet();
        }
    }
    
    function enforceRegistered(AppStorage storage s, address user) internal view {
        if (!s.registrar.isUserRegistered(user)) {
            revert UserNotRegistered();
        }
    }
    
    function validateAuditorPublicKey(AppStorage storage s, uint256[2] memory providedPK) internal view {
        require(
            s.auditorPublicKey.x == providedPK[0] && s.auditorPublicKey.y == providedPK[1],
            "Invalid auditor PK"
        );
    }
}
