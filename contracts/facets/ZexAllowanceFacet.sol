// SPDX-License-Identifier: Ecosystem
pragma solidity ^0.8.27;

import {AppStorage, appStorage, LibAppStorageModifiers} from "../diamond/LibAppStorage.sol";
import {
    Point,
    EGCT,
    EncryptedAllowance,
    ConfidentialApproveProof,
    ConfidentialTransferFromProof,
    CancelAllowanceProof
} from "../types/Types.sol";
import {InvalidProof} from "../errors/Errors.sol";
import {BabyJubJub} from "../libraries/BabyJubJub.sol";

/**
 * @title ZexAllowanceFacet
 * @notice Diamond facet for confidential allowance operations
 */
contract ZexAllowanceFacet {
    // ============ Events ============
    event ConfidentialApproval(address indexed approver, address indexed spender, address indexed operator, uint256[7] auditorPCT, bool isPublic, uint256 publicAmount);
    event ConfidentialTransferFrom(address indexed approver, address indexed spender, address indexed receiver, uint256[7] auditorPCT);
    event AllowanceCancelled(address indexed approver, address indexed spender, bool wasPublic);
    
    // ============ Errors ============
    error Unauthorized();
    error SpenderNotRegistered();
    error ApproverNotRegistered();
    error ReceiverNotRegistered();
    error UseConfidentialApproveForEOA();
    error UsePublicConfidentialTransferFrom();
    error UseConfidentialTransferFrom();
    error NoAllowance();
    error ExceedsAllowance();
    error InvalidAmount();
    error AuditorNotSet();
    
    // ============ Modifiers ============
    modifier onlyIfAuditorSet() {
        AppStorage storage s = appStorage();
        if (s.auditorPublicKey.x == 0 && s.auditorPublicKey.y == 1) revert AuditorNotSet();
        _;
    }
    
    // ============ Functions ============
    
    function confidentialApprove(
        address approver,
        address spender,
        address operator,
        bytes calldata amountEncryptionData,
        bytes calldata /*amountCommitmentData*/,
        bytes calldata proofData
    ) external onlyIfAuditorSet {
        AppStorage storage s = appStorage();
        
        if (approver != msg.sender) revert Unauthorized();
        if (!s.registrar.isUserRegistered(approver)) revert ApproverNotRegistered();
        if (!s.registrar.isUserRegistered(spender)) revert SpenderNotRegistered();
        
        ConfidentialApproveProof memory proof = abi.decode(proofData, (ConfidentialApproveProof));
        
        // Validate public keys
        uint256[2] memory approverPK = s.registrar.getUserPublicKey(approver);
        require(proof.publicSignals[0] == approverPK[0] && proof.publicSignals[1] == approverPK[1], "invalid approver PK");
        
        uint256[2] memory spenderPK = s.registrar.getUserPublicKey(spender);
        require(proof.publicSignals[2] == spenderPK[0] && proof.publicSignals[3] == spenderPK[1], "invalid spender PK");
        
        // Validate auditor PK
        require(s.auditorPublicKey.x == proof.publicSignals[21] && s.auditorPublicKey.y == proof.publicSignals[22], "invalid auditor PK");
        
        // Verify proof
        if (!s.confidentialApproveVerifier.verifyProof(proof.proofPoints.a, proof.proofPoints.b, proof.proofPoints.c, proof.publicSignals)) {
            revert InvalidProof();
        }
        
        // Store allowance
        (uint256[4] memory allowanceEGCT, uint256[7] memory spenderPCT) = abi.decode(amountEncryptionData, (uint256[4], uint256[7]));
        
        EncryptedAllowance storage allowance = s.encryptedAllowances[approver][spender][0];
        allowance.encryptedAmount = EGCT({
            c1: Point({x: allowanceEGCT[0], y: allowanceEGCT[1]}),
            c2: Point({x: allowanceEGCT[2], y: allowanceEGCT[3]})
        });
        allowance.amountPCT = spenderPCT;
        allowance.isPublic = false;
        allowance.nonce++;
        
        uint256[7] memory auditorPCT;
        for (uint i = 0; i < 7; i++) { auditorPCT[i] = proof.publicSignals[23 + i]; }
        emit ConfidentialApproval(approver, spender, operator, auditorPCT, false, 0);
    }
    
    function publicConfidentialApprove(
        address approver,
        address spender,
        uint256 amount,
        bytes calldata /*newBalanceEncryptionData*/,
        bytes calldata /*amountCommitmentData*/,
        bytes calldata proofData
    ) external onlyIfAuditorSet {
        AppStorage storage s = appStorage();
        
        if (approver != msg.sender) revert Unauthorized();
        if (!s.registrar.isUserRegistered(approver)) revert ApproverNotRegistered();
        if (amount == 0) revert InvalidAmount();
        if (s.registrar.isUserRegistered(spender)) revert UseConfidentialApproveForEOA();
        
        ConfidentialApproveProof memory proof = abi.decode(proofData, (ConfidentialApproveProof));
        
        uint256[2] memory approverPK = s.registrar.getUserPublicKey(approver);
        require(proof.publicSignals[0] == approverPK[0] && proof.publicSignals[1] == approverPK[1], "invalid approver PK");
        require(s.auditorPublicKey.x == proof.publicSignals[21] && s.auditorPublicKey.y == proof.publicSignals[22], "invalid auditor PK");
        
        if (!s.confidentialApproveVerifier.verifyProof(proof.proofPoints.a, proof.proofPoints.b, proof.proofPoints.c, proof.publicSignals)) {
            revert InvalidProof();
        }
        
        EncryptedAllowance storage allowance = s.encryptedAllowances[approver][spender][0];
        allowance.isPublic = true;
        allowance.publicAmount = amount;
        allowance.nonce++;
        
        uint256[7] memory emptyPCT;
        emit ConfidentialApproval(approver, spender, spender, emptyPCT, true, amount);
    }
    
    function confidentialTransferFrom(
        address approver,
        address spender,
        bytes calldata amountEncryptionData,
        bytes calldata /*amountCommitmentData*/,
        bytes calldata proofData
    ) external onlyIfAuditorSet {
        AppStorage storage s = appStorage();
        
        if (spender != msg.sender) revert Unauthorized();
        if (!s.registrar.isUserRegistered(approver)) revert ApproverNotRegistered();
        if (!s.registrar.isUserRegistered(spender)) revert SpenderNotRegistered();
        
        EncryptedAllowance storage allowance = s.encryptedAllowances[approver][spender][0];
        if (allowance.isPublic) revert UsePublicConfidentialTransferFrom();
        if (allowance.encryptedAmount.c1.x == 0 && allowance.encryptedAmount.c1.y == 0) revert NoAllowance();
        
        ConfidentialTransferFromProof memory proof = abi.decode(proofData, (ConfidentialTransferFromProof));
        
        uint256[2] memory approverPK = s.registrar.getUserPublicKey(approver);
        uint256[2] memory spenderPK = s.registrar.getUserPublicKey(spender);
        
        require(proof.publicSignals[0] == approverPK[0] && proof.publicSignals[1] == approverPK[1], "invalid approver PK");
        require(proof.publicSignals[2] == spenderPK[0] && proof.publicSignals[3] == spenderPK[1], "invalid spender PK");
        require(s.auditorPublicKey.x == proof.publicSignals[25] && s.auditorPublicKey.y == proof.publicSignals[26], "invalid auditor PK");
        
        if (!s.confidentialTransferFromVerifier.verifyProof(proof.proofPoints.a, proof.proofPoints.b, proof.proofPoints.c, proof.publicSignals)) {
            revert InvalidProof();
        }
        
        (uint256[4] memory newAllowanceData, , uint256[7] memory receiverPCT) = 
            abi.decode(amountEncryptionData, (uint256[4], uint256[4], uint256[7]));
        
        allowance.encryptedAmount = EGCT({
            c1: Point({x: newAllowanceData[0], y: newAllowanceData[1]}),
            c2: Point({x: newAllowanceData[2], y: newAllowanceData[3]})
        });
        allowance.nonce++;
        
        // Credit receiver - add to balance
        EGCT memory receiverAmount = EGCT({
            c1: Point({x: proof.publicSignals[14], y: proof.publicSignals[15]}),
            c2: Point({x: proof.publicSignals[16], y: proof.publicSignals[17]})
        });
        _addToUserBalance(s, spender, 0, receiverAmount, receiverPCT);
        
        emit ConfidentialTransferFrom(approver, spender, spender, receiverPCT);
    }
    
    function publicConfidentialTransferFrom(
        address approver,
        address receiver,
        bytes calldata amountEncryptionData,
        bytes calldata amountCommitmentData,
        bytes calldata /*proofData*/
    ) external onlyIfAuditorSet {
        AppStorage storage s = appStorage();
        
        if (!s.registrar.isUserRegistered(approver)) revert ApproverNotRegistered();
        if (!s.registrar.isUserRegistered(receiver)) revert ReceiverNotRegistered();
        
        EncryptedAllowance storage allowance = s.encryptedAllowances[approver][msg.sender][0];
        if (!allowance.isPublic) revert UseConfidentialTransferFrom();
        if (allowance.publicAmount == 0) revert NoAllowance();
        
        uint256 transferAmount = abi.decode(amountCommitmentData, (uint256));
        if (transferAmount > allowance.publicAmount) revert ExceedsAllowance();
        
        allowance.publicAmount -= transferAmount;
        allowance.nonce++;
        
        (uint256[4] memory receiverAmountData, uint256[7] memory receiverPCT) = 
            abi.decode(amountEncryptionData, (uint256[4], uint256[7]));
        
        EGCT memory receiverEncrypted = EGCT({
            c1: Point({x: receiverAmountData[0], y: receiverAmountData[1]}),
            c2: Point({x: receiverAmountData[2], y: receiverAmountData[3]})
        });
        
        _addToUserBalance(s, receiver, 0, receiverEncrypted, receiverPCT);
        emit ConfidentialTransferFrom(approver, msg.sender, receiver, receiverPCT);
    }
    
    function cancelConfidentialAllowance(address approver, address spender, bytes calldata proofData) external {
        AppStorage storage s = appStorage();
        if (approver != msg.sender) revert Unauthorized();
        
        EncryptedAllowance storage allowance = s.encryptedAllowances[approver][spender][0];
        if (allowance.isPublic) revert UsePublicConfidentialTransferFrom();
        if (allowance.encryptedAmount.c1.x == 0 && allowance.encryptedAmount.c1.y == 0) revert NoAllowance();
        
        CancelAllowanceProof memory proof = abi.decode(proofData, (CancelAllowanceProof));
        
        uint256[2] memory approverPK = s.registrar.getUserPublicKey(approver);
        require(proof.publicSignals[0] == approverPK[0] && proof.publicSignals[1] == approverPK[1], "invalid approver PK");
        
        if (!s.cancelAllowanceVerifier.verifyProof(proof.proofPoints.a, proof.proofPoints.b, proof.proofPoints.c, proof.publicSignals)) {
            revert InvalidProof();
        }
        
        delete s.encryptedAllowances[approver][spender][0];
        emit AllowanceCancelled(approver, spender, false);
    }
    
    function cancelPublicConfidentialAllowance(
        address approver,
        address spender,
        bytes calldata /*balanceEncryptionData*/,
        bytes calldata /*amountCommitmentData*/,
        bytes calldata proofData
    ) external {
        AppStorage storage s = appStorage();
        if (approver != msg.sender) revert Unauthorized();
        
        EncryptedAllowance storage allowance = s.encryptedAllowances[approver][spender][0];
        if (!allowance.isPublic) revert UseConfidentialTransferFrom();
        if (allowance.publicAmount == 0) revert NoAllowance();
        
        CancelAllowanceProof memory proof = abi.decode(proofData, (CancelAllowanceProof));
        
        uint256[2] memory approverPK = s.registrar.getUserPublicKey(approver);
        require(proof.publicSignals[0] == approverPK[0] && proof.publicSignals[1] == approverPK[1], "invalid approver PK");
        
        if (!s.cancelAllowanceVerifier.verifyProof(proof.proofPoints.a, proof.proofPoints.b, proof.proofPoints.c, proof.publicSignals)) {
            revert InvalidProof();
        }
        
        delete s.encryptedAllowances[approver][spender][0];
        emit AllowanceCancelled(approver, spender, true);
    }
    
    // ============ View Functions ============
    
    function getAllowance(address approver, address spender, uint256 tokenId) external view returns (
        EGCT memory encryptedAmount,
        uint256[7] memory amountPCT,
        bool isPublic,
        uint256 publicAmount,
        uint256 nonce
    ) {
        AppStorage storage s = appStorage();
        EncryptedAllowance storage allowance = s.encryptedAllowances[approver][spender][tokenId];
        return (allowance.encryptedAmount, allowance.amountPCT, allowance.isPublic, allowance.publicAmount, allowance.nonce);
    }
    
    // ============ Internal Helpers ============
    
    function _addToUserBalance(AppStorage storage s, address user, uint256 tokenId, EGCT memory amount, uint256[7] memory pct) internal {
        s.balances[user][tokenId].eGCT.c1 = BabyJubJub._add(s.balances[user][tokenId].eGCT.c1, amount.c1);
        s.balances[user][tokenId].eGCT.c2 = BabyJubJub._add(s.balances[user][tokenId].eGCT.c2, amount.c2);
        s.balances[user][tokenId].transactionIndex++;
        s.balances[user][tokenId].balanceList[s.balances[user][tokenId].transactionIndex].index = s.balances[user][tokenId].nonce;
        s.balances[user][tokenId].balanceList[s.balances[user][tokenId].transactionIndex].isValid = true;
    }
}
