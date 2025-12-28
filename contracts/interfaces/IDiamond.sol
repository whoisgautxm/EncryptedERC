// SPDX-License-Identifier: Ecosystem
pragma solidity ^0.8.27;

/**
 * @title IDiamondCut
 * @notice Interface for adding/replacing/removing facets
 */
interface IDiamondCut {
    enum FacetCutAction { Add, Replace, Remove }
    
    struct FacetCut {
        address facetAddress;
        FacetCutAction action;
        bytes4[] functionSelectors;
    }
    
    function diamondCut(FacetCut[] calldata _diamondCut, address _init, bytes calldata _calldata) external;
    
    event DiamondCut(FacetCut[] _diamondCut, address _init, bytes _calldata);
}

/**
 * @title IDiamondLoupe
 * @notice Interface for inspecting diamond facets
 */
interface IDiamondLoupe {
    struct Facet {
        address facetAddress;
        bytes4[] functionSelectors;
    }
    
    function facets() external view returns (Facet[] memory facets_);
    function facetFunctionSelectors(address _facet) external view returns (bytes4[] memory facetFunctionSelectors_);
    function facetAddresses() external view returns (address[] memory facetAddresses_);
    function facetAddress(bytes4 _functionSelector) external view returns (address facetAddress_);
}
