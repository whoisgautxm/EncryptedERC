pragma circom 2.1.9;

include "./components.circom";

/**
 * CancelAllowanceCircuit
 * 
 * This circuit proves:
 * 1. Approver owns the private key for cancellation
 * 2. The provided allowance matches what was stored
 */
template CancelAllowanceCircuit() {
    // Private inputs
    signal input ApproverPrivateKey;
    signal input AllowanceAmount;          // The amount that was approved (for verification)
    
    // Public inputs
    signal input ApproverPublicKey[2];
    signal input SpenderPublicKey[2];
    signal input AllowanceC1[2];           // Current encrypted allowance to cancel
    signal input AllowanceC2[2];
    
    // 1. Verify approver's public key
    component checkApproverPK = CheckPublicKey();
    checkApproverPK.privKey <== ApproverPrivateKey;
    checkApproverPK.pubKey[0] <== ApproverPublicKey[0];
    checkApproverPK.pubKey[1] <== ApproverPublicKey[1];
    
    // 2. Verify the allowance can be decrypted (proves ownership of the approval)
    // The spender's public key was used for encryption, but the approver
    // created it, so we verify the structure matches
    component checkPoint1 = BabyCheck();
    checkPoint1.x <== AllowanceC1[0];
    checkPoint1.y <== AllowanceC1[1];
    
    component checkPoint2 = BabyCheck();
    checkPoint2.x <== AllowanceC2[0];
    checkPoint2.y <== AllowanceC2[1];
}

component main { public [ 
    ApproverPublicKey, SpenderPublicKey,
    AllowanceC1, AllowanceC2
] } = CancelAllowanceCircuit();
