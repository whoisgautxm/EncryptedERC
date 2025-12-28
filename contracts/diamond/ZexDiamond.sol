// SPDX-License-Identifier: Ecosystem
pragma solidity ^0.8.27;

import {LibDiamond} from "./LibDiamond.sol";
import {IDiamondCut} from "../interfaces/IDiamond.sol";
import {AppStorage, appStorage} from "./LibAppStorage.sol";
import {IRegistrar} from "../interfaces/IRegistrar.sol";

/**
 * @title ZexDiamond
 * @notice Diamond proxy for the ZEX confidential token and DEX
 * @dev EIP-2535 Diamond implementation - routes calls to facets via delegatecall
 */
contract ZexDiamond {
    /**
     * @notice Initialize the diamond with owner and facets
     * @param _owner Diamond owner address
     * @param _diamondCut Initial facets to add
     * @param _init Optional initializer contract
     * @param _initData Optional init call data
     */
    constructor(
        address _owner,
        IDiamondCut.FacetCut[] memory _diamondCut,
        address _init,
        bytes memory _initData
    ) {
        LibDiamond.setContractOwner(_owner);
        LibDiamond.diamondCut(_diamondCut, _init, _initData);
    }
    
    /**
     * @notice Fallback function - routes calls to facets
     */
    fallback() external payable {
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        address facet = ds.selectorToFacetAndPosition[msg.sig].facetAddress;
        require(facet != address(0), "Diamond: Function does not exist");
        
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
    
    receive() external payable {}
}

/**
 * @title DiamondCutFacet
 * @notice Facet for adding/replacing/removing facets
 */
contract DiamondCutFacet is IDiamondCut {
    function diamondCut(
        FacetCut[] calldata _diamondCut,
        address _init,
        bytes calldata _calldata
    ) external override {
        LibDiamond.enforceIsContractOwner();
        LibDiamond.diamondCut(_diamondCut, _init, _calldata);
    }
}

/**
 * @title DiamondInit
 * @notice Initializer for ZEX Diamond - sets up initial state
 */
contract DiamondInit {
    struct InitParams {
        string name;
        string symbol;
        uint8 decimals;
        address registrar;
        address mintVerifier;
        address withdrawVerifier;
        address transferVerifier;
        address burnVerifier;
        address confidentialApproveVerifier;
        address confidentialTransferFromVerifier;
        address cancelAllowanceVerifier;
        address offerAcceptanceVerifier;
        address offerFinalizationVerifier;
    }
    
    function init(InitParams calldata params) external {
        AppStorage storage s = appStorage();
        
        s.name = params.name;
        s.symbol = params.symbol;
        s.decimals = params.decimals;
        s.registrar = IRegistrar(params.registrar);
        
        // Set auditor public key to (0, 1) initially (not set)
        s.auditorPublicKey.x = 0;
        s.auditorPublicKey.y = 1;
        s.auditorSetter = msg.sender;
        
        // Initialize verifiers
        s.mintVerifier = IMintVerifier(params.mintVerifier);
        s.withdrawVerifier = IWithdrawVerifier(params.withdrawVerifier);
        s.transferVerifier = ITransferVerifier(params.transferVerifier);
        s.burnVerifier = IBurnVerifier(params.burnVerifier);
        s.confidentialApproveVerifier = IConfidentialApproveVerifier(params.confidentialApproveVerifier);
        s.confidentialTransferFromVerifier = IConfidentialTransferFromVerifier(params.confidentialTransferFromVerifier);
        s.cancelAllowanceVerifier = ICancelAllowanceVerifier(params.cancelAllowanceVerifier);
        s.offerAcceptanceVerifier = IOfferAcceptanceVerifier(params.offerAcceptanceVerifier);
        s.offerFinalizationVerifier = IOfferFinalizationVerifier(params.offerFinalizationVerifier);
        
        // Start token ID at 1 (0 is reserved for native token)
        s.nextTokenId = 1;
    }
}

// Import verifier interfaces for DiamondInit
import {IMintVerifier} from "../interfaces/verifiers/IMintVerifier.sol";
import {IWithdrawVerifier} from "../interfaces/verifiers/IWithdrawVerifier.sol";
import {ITransferVerifier} from "../interfaces/verifiers/ITransferVerifier.sol";
import {IBurnVerifier} from "../interfaces/verifiers/IBurnVerifier.sol";
import {IConfidentialApproveVerifier} from "../interfaces/verifiers/IConfidentialApproveVerifier.sol";
import {IConfidentialTransferFromVerifier} from "../interfaces/verifiers/IConfidentialTransferFromVerifier.sol";
import {ICancelAllowanceVerifier} from "../interfaces/verifiers/ICancelAllowanceVerifier.sol";
import {IOfferAcceptanceVerifier} from "../interfaces/verifiers/IOfferAcceptanceVerifier.sol";
import {IOfferFinalizationVerifier} from "../interfaces/verifiers/IOfferFinalizationVerifier.sol";
