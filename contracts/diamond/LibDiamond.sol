// SPDX-License-Identifier: Ecosystem
pragma solidity ^0.8.27;

import {IDiamondCut} from "../interfaces/IDiamond.sol";

/**
 * @title LibDiamond
 * @notice Library for diamond storage and facet management
 */
library LibDiamond {
    bytes32 constant DIAMOND_STORAGE_POSITION = keccak256("diamond.standard.diamond.storage");
    
    struct FacetAddressAndPosition {
        address facetAddress;
        uint96 functionSelectorPosition;
    }
    
    struct FacetFunctionSelectors {
        bytes4[] functionSelectors;
        uint256 facetAddressPosition;
    }
    
    struct DiamondStorage {
        // Maps function selector to facet address and position
        mapping(bytes4 => FacetAddressAndPosition) selectorToFacetAndPosition;
        // Maps facet to its function selectors
        mapping(address => FacetFunctionSelectors) facetFunctionSelectors;
        // Facet addresses
        address[] facetAddresses;
        // Owner
        address contractOwner;
    }
    
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event DiamondCut(IDiamondCut.FacetCut[] _diamondCut, address _init, bytes _calldata);
    
    error NotOwner();
    error NoSelectorsInFacet();
    error NoZeroAddress();
    error SelectorExists(bytes4 selector);
    error SelectorNotFound(bytes4 selector);
    error RemoveFacetMustBeZero();
    error InitReverted(bytes data);
    
    function diamondStorage() internal pure returns (DiamondStorage storage ds) {
        bytes32 position = DIAMOND_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }
    
    function setContractOwner(address _newOwner) internal {
        DiamondStorage storage ds = diamondStorage();
        address previousOwner = ds.contractOwner;
        ds.contractOwner = _newOwner;
        emit OwnershipTransferred(previousOwner, _newOwner);
    }
    
    function contractOwner() internal view returns (address owner_) {
        owner_ = diamondStorage().contractOwner;
    }
    
    function enforceIsContractOwner() internal view {
        if (msg.sender != diamondStorage().contractOwner) revert NotOwner();
    }
    
    function diamondCut(IDiamondCut.FacetCut[] memory _diamondCut, address _init, bytes memory _calldata) internal {
        for (uint256 i; i < _diamondCut.length; i++) {
            IDiamondCut.FacetCutAction action = _diamondCut[i].action;
            if (action == IDiamondCut.FacetCutAction.Add) {
                addFunctions(_diamondCut[i].facetAddress, _diamondCut[i].functionSelectors);
            } else if (action == IDiamondCut.FacetCutAction.Replace) {
                replaceFunctions(_diamondCut[i].facetAddress, _diamondCut[i].functionSelectors);
            } else if (action == IDiamondCut.FacetCutAction.Remove) {
                removeFunctions(_diamondCut[i].facetAddress, _diamondCut[i].functionSelectors);
            }
        }
        emit DiamondCut(_diamondCut, _init, _calldata);
        initializeDiamondCut(_init, _calldata);
    }
    
    function addFunctions(address _facetAddress, bytes4[] memory _functionSelectors) internal {
        if (_functionSelectors.length == 0) revert NoSelectorsInFacet();
        DiamondStorage storage ds = diamondStorage();
        if (_facetAddress == address(0)) revert NoZeroAddress();
        
        uint96 selectorPosition = uint96(ds.facetFunctionSelectors[_facetAddress].functionSelectors.length);
        
        // Add facet address if new
        if (selectorPosition == 0) {
            ds.facetFunctionSelectors[_facetAddress].facetAddressPosition = ds.facetAddresses.length;
            ds.facetAddresses.push(_facetAddress);
        }
        
        for (uint256 i; i < _functionSelectors.length; i++) {
            bytes4 selector = _functionSelectors[i];
            if (ds.selectorToFacetAndPosition[selector].facetAddress != address(0)) {
                revert SelectorExists(selector);
            }
            ds.selectorToFacetAndPosition[selector] = FacetAddressAndPosition(_facetAddress, selectorPosition);
            ds.facetFunctionSelectors[_facetAddress].functionSelectors.push(selector);
            selectorPosition++;
        }
    }
    
    function replaceFunctions(address _facetAddress, bytes4[] memory _functionSelectors) internal {
        if (_functionSelectors.length == 0) revert NoSelectorsInFacet();
        DiamondStorage storage ds = diamondStorage();
        if (_facetAddress == address(0)) revert NoZeroAddress();
        
        uint96 selectorPosition = uint96(ds.facetFunctionSelectors[_facetAddress].functionSelectors.length);
        
        if (selectorPosition == 0) {
            ds.facetFunctionSelectors[_facetAddress].facetAddressPosition = ds.facetAddresses.length;
            ds.facetAddresses.push(_facetAddress);
        }
        
        for (uint256 i; i < _functionSelectors.length; i++) {
            bytes4 selector = _functionSelectors[i];
            address oldFacet = ds.selectorToFacetAndPosition[selector].facetAddress;
            if (oldFacet == address(0)) revert SelectorNotFound(selector);
            if (oldFacet == _facetAddress) continue;
            
            removeFunction(ds, oldFacet, selector);
            ds.selectorToFacetAndPosition[selector] = FacetAddressAndPosition(_facetAddress, selectorPosition);
            ds.facetFunctionSelectors[_facetAddress].functionSelectors.push(selector);
            selectorPosition++;
        }
    }
    
    function removeFunctions(address _facetAddress, bytes4[] memory _functionSelectors) internal {
        if (_functionSelectors.length == 0) revert NoSelectorsInFacet();
        DiamondStorage storage ds = diamondStorage();
        if (_facetAddress != address(0)) revert RemoveFacetMustBeZero();
        
        for (uint256 i; i < _functionSelectors.length; i++) {
            bytes4 selector = _functionSelectors[i];
            address facet = ds.selectorToFacetAndPosition[selector].facetAddress;
            if (facet == address(0)) revert SelectorNotFound(selector);
            removeFunction(ds, facet, selector);
        }
    }
    
    function removeFunction(DiamondStorage storage ds, address _facetAddress, bytes4 _selector) internal {
        uint256 selectorPosition = ds.selectorToFacetAndPosition[_selector].functionSelectorPosition;
        uint256 lastSelectorPosition = ds.facetFunctionSelectors[_facetAddress].functionSelectors.length - 1;
        
        if (selectorPosition != lastSelectorPosition) {
            bytes4 lastSelector = ds.facetFunctionSelectors[_facetAddress].functionSelectors[lastSelectorPosition];
            ds.facetFunctionSelectors[_facetAddress].functionSelectors[selectorPosition] = lastSelector;
            ds.selectorToFacetAndPosition[lastSelector].functionSelectorPosition = uint96(selectorPosition);
        }
        
        ds.facetFunctionSelectors[_facetAddress].functionSelectors.pop();
        delete ds.selectorToFacetAndPosition[_selector];
        
        if (ds.facetFunctionSelectors[_facetAddress].functionSelectors.length == 0) {
            uint256 lastFacetPosition = ds.facetAddresses.length - 1;
            uint256 facetPosition = ds.facetFunctionSelectors[_facetAddress].facetAddressPosition;
            if (facetPosition != lastFacetPosition) {
                address lastFacet = ds.facetAddresses[lastFacetPosition];
                ds.facetAddresses[facetPosition] = lastFacet;
                ds.facetFunctionSelectors[lastFacet].facetAddressPosition = facetPosition;
            }
            ds.facetAddresses.pop();
            delete ds.facetFunctionSelectors[_facetAddress];
        }
    }
    
    function initializeDiamondCut(address _init, bytes memory _calldata) internal {
        if (_init == address(0)) return;
        (bool success, bytes memory error) = _init.delegatecall(_calldata);
        if (!success) {
            if (error.length > 0) {
                assembly { revert(add(error, 32), mload(error)) }
            } else {
                revert InitReverted(error);
            }
        }
    }
}
