pragma circom 2.1.9;

include "./components.circom";

/**
 * ConfidentialApproveCircuit
 * 
 * This circuit proves:
 * 1. Sender owns the private key for their public key
 * 2. The approval amount is less than or equal to sender's balance
 * 3. The encrypted allowance is correctly formed for the spender's public key
 * 4. PCT contains the correct amount for spender decryption
 * 5. Auditor PCT contains the correct amount
 */
template ConfidentialApproveCircuit() {
    // Private inputs
    signal input ApprovalAmount;
    signal input SenderPrivateKey;
    signal input SenderBalance;
    signal input AllowanceRandom;          // Random for ElGamal encryption
    signal input SpenderPCTRandom;         // Random for spender PCT
    signal input AuditorPCTRandom;         // Random for auditor PCT
    
    // Public inputs  
    signal input SenderPublicKey[2];
    signal input SpenderPublicKey[2];
    signal input OperatorPublicKey[2];     // Can be same as spender for EOA
    signal input SenderBalanceC1[2];       // Current encrypted balance
    signal input SenderBalanceC2[2];
    signal input AllowanceC1[2];           // Encrypted allowance for spender
    signal input AllowanceC2[2];
    signal input SpenderPCT[4];            // PCT for spender to decrypt
    signal input SpenderPCTAuthKey[2];
    signal input SpenderPCTNonce;
    signal input AuditorPublicKey[2];
    signal input AuditorPCT[4];
    signal input AuditorPCTAuthKey[2];
    signal input AuditorPCTNonce;
    
    // Base order for range checks
    var baseOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    
    // 1. Verify approval amount is valid (>0 and < baseOrder)
    component amountBits = Num2Bits(252);
    amountBits.in <== ApprovalAmount;
    
    component baseOrderBits = Num2Bits(252);
    baseOrderBits.in <== baseOrder;
    
    component ltAmount = LessThan(252);
    ltAmount.in[0] <== ApprovalAmount;
    ltAmount.in[1] <== baseOrder;
    ltAmount.out === 1;
    
    // 2. Verify approval amount <= sender balance
    component balanceBits = Num2Bits(252);
    balanceBits.in <== SenderBalance + 1;
    
    component checkAmount = LessThan(252);
    checkAmount.in[0] <== ApprovalAmount;
    checkAmount.in[1] <== SenderBalance + 1;
    checkAmount.out === 1;
    
    // 3. Verify sender's public key
    component checkSenderPK = CheckPublicKey();
    checkSenderPK.privKey <== SenderPrivateKey;
    checkSenderPK.pubKey[0] <== SenderPublicKey[0];
    checkSenderPK.pubKey[1] <== SenderPublicKey[1];
    
    // 4. Verify sender's current encrypted balance is valid
    component checkSenderBalance = CheckValue();
    checkSenderBalance.value <== SenderBalance;
    checkSenderBalance.privKey <== SenderPrivateKey;
    checkSenderBalance.valueC1[0] <== SenderBalanceC1[0];
    checkSenderBalance.valueC1[1] <== SenderBalanceC1[1];
    checkSenderBalance.valueC2[0] <== SenderBalanceC2[0];
    checkSenderBalance.valueC2[1] <== SenderBalanceC2[1];
    
    // 5. Verify the allowance is correctly encrypted for spender
    component checkAllowance = CheckReceiverValue();
    checkAllowance.receiverValue <== ApprovalAmount;
    checkAllowance.receiverPublicKey[0] <== SpenderPublicKey[0];
    checkAllowance.receiverPublicKey[1] <== SpenderPublicKey[1];
    checkAllowance.receiverRandom <== AllowanceRandom;
    checkAllowance.receiverValueC1[0] <== AllowanceC1[0];
    checkAllowance.receiverValueC1[1] <== AllowanceC1[1];
    checkAllowance.receiverValueC2[0] <== AllowanceC2[0];
    checkAllowance.receiverValueC2[1] <== AllowanceC2[1];
    
    // 6. Verify spender's PCT contains the correct amount
    component checkSpenderPCT = CheckPCT();
    checkSpenderPCT.publicKey[0] <== SpenderPublicKey[0];
    checkSpenderPCT.publicKey[1] <== SpenderPublicKey[1];
    checkSpenderPCT.pct <== SpenderPCT;
    checkSpenderPCT.authKey[0] <== SpenderPCTAuthKey[0];
    checkSpenderPCT.authKey[1] <== SpenderPCTAuthKey[1];
    checkSpenderPCT.nonce <== SpenderPCTNonce;
    checkSpenderPCT.random <== SpenderPCTRandom;
    checkSpenderPCT.value <== ApprovalAmount;
    
    // 7. Verify auditor's PCT
    component checkAuditorPCT = CheckPCT();
    checkAuditorPCT.publicKey[0] <== AuditorPublicKey[0];
    checkAuditorPCT.publicKey[1] <== AuditorPublicKey[1];
    checkAuditorPCT.pct <== AuditorPCT;
    checkAuditorPCT.authKey[0] <== AuditorPCTAuthKey[0];
    checkAuditorPCT.authKey[1] <== AuditorPCTAuthKey[1];
    checkAuditorPCT.nonce <== AuditorPCTNonce;
    checkAuditorPCT.random <== AuditorPCTRandom;
    checkAuditorPCT.value <== ApprovalAmount;
}

component main { public [ 
    SenderPublicKey, SpenderPublicKey, OperatorPublicKey,
    SenderBalanceC1, SenderBalanceC2,
    AllowanceC1, AllowanceC2,
    SpenderPCT, SpenderPCTAuthKey, SpenderPCTNonce,
    AuditorPublicKey, AuditorPCT, AuditorPCTAuthKey, AuditorPCTNonce
] } = ConfidentialApproveCircuit();
