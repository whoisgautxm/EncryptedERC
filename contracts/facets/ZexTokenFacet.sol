// SPDX-License-Identifier: Ecosystem
pragma solidity ^0.8.27;

import {AppStorage, appStorage} from "../diamond/LibAppStorage.sol";
import {Point, EGCT, EncryptedBalance, AmountPCT, MintProof, TransferProof, BurnProof} from "../types/Types.sol";
import {InvalidProof, UserNotRegistered} from "../errors/Errors.sol";
import {BabyJubJub} from "../libraries/BabyJubJub.sol";

/**
 * @title ZexTokenFacet
 * @notice Diamond facet for core token operations (mint, transfer, burn)
 */
contract ZexTokenFacet {
    // ============ Events ============
    event PrivateMint(address indexed user, uint256[7] auditorPCT, address indexed auditorAddress);
    event PrivateTransfer(address indexed sender, address indexed receiver, uint256[7] auditorPCT, address indexed auditorAddress);
    event PrivateBurn(address indexed user, uint256[7] auditorPCT, address indexed auditorAddress);
    event AuditorSet(address indexed setter, uint256[2] auditorPublicKey);
    
    // ============ Errors ============
    error AuditorNotSet();
    error AuditorAlreadySet();
    error InvalidMintNullifier();
    error SenderNotRegistered();
    error ReceiverNotRegistered();
    
    // ============ Modifiers ============
    modifier onlyIfAuditorSet() {
        AppStorage storage s = appStorage();
        if (s.auditorPublicKey.x == 0 && s.auditorPublicKey.y == 1) revert AuditorNotSet();
        _;
    }
    
    // ============ Admin Functions ============
    
    function setAuditorPublicKey(uint256[2] calldata publicKey) external {
        AppStorage storage s = appStorage();
        if (s.auditorPublicKey.x != 0 || s.auditorPublicKey.y != 1) revert AuditorAlreadySet();
        s.auditorPublicKey = Point({x: publicKey[0], y: publicKey[1]});
        emit AuditorSet(msg.sender, publicKey);
    }
    
    // ============ Token Functions ============
    
    function mint(
        address to,
        bytes calldata amountEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata proofData
    ) external onlyIfAuditorSet {
        AppStorage storage s = appStorage();
        
        if (!s.registrar.isUserRegistered(to)) revert UserNotRegistered();
        
        MintProof memory proof = abi.decode(proofData, (MintProof));
        
        // Validate user's public key
        uint256[2] memory userPK = s.registrar.getUserPublicKey(to);
        require(proof.publicSignals[0] == userPK[0] && proof.publicSignals[1] == userPK[1], "invalid user PK");
        
        // Validate auditor public key
        require(s.auditorPublicKey.x == proof.publicSignals[14] && s.auditorPublicKey.y == proof.publicSignals[15], "invalid auditor PK");
        
        // Check nullifier
        uint256 mintNullifier = proof.publicSignals[13];
        if (s.alreadyMinted[mintNullifier]) revert InvalidMintNullifier();
        s.alreadyMinted[mintNullifier] = true;
        
        // Verify proof
        if (!s.mintVerifier.verifyProof(proof.proofPoints.a, proof.proofPoints.b, proof.proofPoints.c, proof.publicSignals)) {
            revert InvalidProof();
        }
        
        // Decode encrypted amount
        (uint256[4] memory encryptedAmount, uint256[7] memory pct) = abi.decode(amountEncryptionData, (uint256[4], uint256[7]));
        
        EGCT memory amount = EGCT({
            c1: Point({x: encryptedAmount[0], y: encryptedAmount[1]}),
            c2: Point({x: encryptedAmount[2], y: encryptedAmount[3]})
        });
        
        _addToUserBalance(s, to, 0, amount, pct);
        
        // Auditor PCT from proof
        uint256[7] memory auditorPCT;
        for (uint i = 0; i < 7; i++) { auditorPCT[i] = proof.publicSignals[16 + i]; }
        
        emit PrivateMint(to, auditorPCT, s.auditorSetter);
    }
    
    function transfer(
        address from,
        address to,
        bytes calldata amountEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata proofData
    ) external onlyIfAuditorSet {
        AppStorage storage s = appStorage();
        
        if (!s.registrar.isUserRegistered(from)) revert SenderNotRegistered();
        if (!s.registrar.isUserRegistered(to)) revert ReceiverNotRegistered();
        
        TransferProof memory proof = abi.decode(proofData, (TransferProof));
        
        // Validate sender and receiver PKs
        uint256[2] memory senderPK = s.registrar.getUserPublicKey(from);
        uint256[2] memory receiverPK = s.registrar.getUserPublicKey(to);
        
        require(proof.publicSignals[0] == senderPK[0] && proof.publicSignals[1] == senderPK[1], "invalid sender PK");
        require(proof.publicSignals[2] == receiverPK[0] && proof.publicSignals[3] == receiverPK[1], "invalid receiver PK");
        
        // Validate auditor PK
        require(s.auditorPublicKey.x == proof.publicSignals[23] && s.auditorPublicKey.y == proof.publicSignals[24], "invalid auditor PK");
        
        // Verify proof
        if (!s.transferVerifier.verifyProof(proof.proofPoints.a, proof.proofPoints.b, proof.proofPoints.c, proof.publicSignals)) {
            revert InvalidProof();
        }
        
        // Decode amounts
        (
            uint256[4] memory senderNewBalance,
            uint256[4] memory receiverAmount,
            uint256[7] memory receiverPCT,
            uint256[7] memory senderPCT
        ) = abi.decode(amountEncryptionData, (uint256[4], uint256[4], uint256[7], uint256[7]));
        
        // Subtract from sender
        EGCT memory subtractAmount = EGCT({
            c1: Point({x: proof.publicSignals[8], y: proof.publicSignals[9]}),
            c2: Point({x: proof.publicSignals[10], y: proof.publicSignals[11]})
        });
        _subtractFromUserBalance(s, from, 0, subtractAmount, senderPCT);
        
        // Add to receiver
        EGCT memory addAmount = EGCT({
            c1: Point({x: receiverAmount[0], y: receiverAmount[1]}),
            c2: Point({x: receiverAmount[2], y: receiverAmount[3]})
        });
        _addToUserBalance(s, to, 0, addAmount, receiverPCT);
        
        uint256[7] memory auditorPCT;
        for (uint i = 0; i < 7; i++) { auditorPCT[i] = proof.publicSignals[25 + i]; }
        emit PrivateTransfer(from, to, auditorPCT, s.auditorSetter);
    }
    
    function burn(
        address from,
        bytes calldata amountEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata proofData
    ) external onlyIfAuditorSet {
        AppStorage storage s = appStorage();
        
        if (!s.registrar.isUserRegistered(from)) revert UserNotRegistered();
        
        BurnProof memory proof = abi.decode(proofData, (BurnProof));
        
        uint256[2] memory userPK = s.registrar.getUserPublicKey(from);
        require(proof.publicSignals[0] == userPK[0] && proof.publicSignals[1] == userPK[1], "invalid user PK");
        require(s.auditorPublicKey.x == proof.publicSignals[10] && s.auditorPublicKey.y == proof.publicSignals[11], "invalid auditor PK");
        
        if (!s.burnVerifier.verifyProof(proof.proofPoints.a, proof.proofPoints.b, proof.proofPoints.c, proof.publicSignals)) {
            revert InvalidProof();
        }
        
        (uint256[4] memory newBalance, uint256[7] memory pct) = abi.decode(amountEncryptionData, (uint256[4], uint256[7]));
        
        EGCT memory burnAmount = EGCT({
            c1: Point({x: proof.publicSignals[6], y: proof.publicSignals[7]}),
            c2: Point({x: proof.publicSignals[8], y: proof.publicSignals[9]})
        });
        _subtractFromUserBalance(s, from, 0, burnAmount, pct);
        
        uint256[7] memory auditorPCT;
        for (uint i = 0; i < 7; i++) { auditorPCT[i] = proof.publicSignals[12 + i]; }
        emit PrivateBurn(from, auditorPCT, s.auditorSetter);
    }
    
    // ============ View Functions ============
    
    function balanceOf(address user, uint256 tokenId) external view returns (
        EGCT memory eGCT,
        uint256 nonce,
        AmountPCT[] memory amountPCTs,
        uint256[7] memory balancePCT,
        uint256 transactionIndex
    ) {
        AppStorage storage s = appStorage();
        EncryptedBalance storage balance = s.balances[user][tokenId];
        return (balance.eGCT, balance.nonce, balance.amountPCTs, balance.balancePCT, balance.transactionIndex);
    }
    
    function balanceOfStandalone(address user) external view returns (
        EGCT memory eGCT,
        uint256 nonce,
        AmountPCT[] memory amountPCTs,
        uint256[7] memory balancePCT,
        uint256 transactionIndex
    ) {
        return this.balanceOf(user, 0);
    }
    
    function name() external view returns (string memory) {
        return appStorage().name;
    }
    
    function symbol() external view returns (string memory) {
        return appStorage().symbol;
    }
    
    function decimals() external view returns (uint8) {
        return appStorage().decimals;
    }
    
    function registrar() external view returns (address) {
        return address(appStorage().registrar);
    }
    
    function auditorPublicKey() external view returns (Point memory) {
        return appStorage().auditorPublicKey;
    }
    
    // ============ Internal Helpers ============
    
    function _addToUserBalance(AppStorage storage s, address user, uint256 tokenId, EGCT memory amount, uint256[7] memory pct) internal {
        s.balances[user][tokenId].eGCT.c1 = BabyJubJub._add(s.balances[user][tokenId].eGCT.c1, amount.c1);
        s.balances[user][tokenId].eGCT.c2 = BabyJubJub._add(s.balances[user][tokenId].eGCT.c2, amount.c2);
        s.balances[user][tokenId].transactionIndex++;
        s.balances[user][tokenId].balanceList[s.balances[user][tokenId].transactionIndex].index = s.balances[user][tokenId].nonce;
        s.balances[user][tokenId].balanceList[s.balances[user][tokenId].transactionIndex].isValid = true;
    }
    
    function _subtractFromUserBalance(AppStorage storage s, address user, uint256 tokenId, EGCT memory amount, uint256[7] memory pct) internal {
        s.balances[user][tokenId].eGCT.c1 = BabyJubJub._sub(s.balances[user][tokenId].eGCT.c1, amount.c1);
        s.balances[user][tokenId].eGCT.c2 = BabyJubJub._sub(s.balances[user][tokenId].eGCT.c2, amount.c2);
        s.balances[user][tokenId].transactionIndex++;
        s.balances[user][tokenId].nonce++;
    }
}
