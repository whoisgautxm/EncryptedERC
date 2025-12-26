pragma circom 2.1.9;

include "./components.circom";

/**
 * ConfidentialTransferFromCircuit
 * 
 * This circuit proves:
 * 1. Spender knows the allowance amount (can decrypt it)
 * 2. Transfer amount <= remaining allowance
 * 3. Receiver's encrypted amount is correct
 * 4. New allowance is correctly computed
 * 5. PCTs are valid for receiver and auditor
 */
template ConfidentialTransferFromCircuit() {
    // Private inputs
    signal input SpenderPrivateKey;
    signal input TransferAmount;
    signal input AllowanceAmount;          // Decrypted from allowance EGCT
    signal input ReceiverRandom;           // Random for receiver encryption
    signal input NewAllowanceRandom;       // Random for new allowance encryption
    signal input ReceiverPCTRandom;
    signal input AuditorPCTRandom;
    
    // Public inputs
    signal input ApproverPublicKey[2];     // Original approver's public key
    signal input SpenderPublicKey[2];
    signal input ReceiverPublicKey[2];
    signal input AllowanceC1[2];           // Current encrypted allowance
    signal input AllowanceC2[2];
    signal input NewAllowanceC1[2];        // Allowance after transfer
    signal input NewAllowanceC2[2];
    signal input ReceiverAmountC1[2];      // Encrypted amount for receiver
    signal input ReceiverAmountC2[2];
    signal input ReceiverPCT[4];
    signal input ReceiverPCTAuthKey[2];
    signal input ReceiverPCTNonce;
    signal input AuditorPublicKey[2];
    signal input AuditorPCT[4];
    signal input AuditorPCTAuthKey[2];
    signal input AuditorPCTNonce;
    
    var baseOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    
    // 1. Verify transfer amount is valid
    component amountBits = Num2Bits(252);
    amountBits.in <== TransferAmount;
    
    component baseOrderBits = Num2Bits(252);
    baseOrderBits.in <== baseOrder;
    
    component ltAmount = LessThan(252);
    ltAmount.in[0] <== TransferAmount;
    ltAmount.in[1] <== baseOrder;
    ltAmount.out === 1;
    
    // 2. Verify transfer <= allowance
    component allowanceBits = Num2Bits(252);
    allowanceBits.in <== AllowanceAmount + 1;
    
    component checkTransfer = LessThan(252);
    checkTransfer.in[0] <== TransferAmount;
    checkTransfer.in[1] <== AllowanceAmount + 1;
    checkTransfer.out === 1;
    
    // 3. Verify spender's public key
    component checkSpenderPK = CheckPublicKey();
    checkSpenderPK.privKey <== SpenderPrivateKey;
    checkSpenderPK.pubKey[0] <== SpenderPublicKey[0];
    checkSpenderPK.pubKey[1] <== SpenderPublicKey[1];
    
    // 4. Verify spender can decrypt the allowance
    component checkAllowance = CheckValue();
    checkAllowance.value <== AllowanceAmount;
    checkAllowance.privKey <== SpenderPrivateKey;
    checkAllowance.valueC1[0] <== AllowanceC1[0];
    checkAllowance.valueC1[1] <== AllowanceC1[1];
    checkAllowance.valueC2[0] <== AllowanceC2[0];
    checkAllowance.valueC2[1] <== AllowanceC2[1];
    
    // 5. Verify new allowance is correctly encrypted (remaining = allowance - transfer)
    signal remainingAllowance;
    remainingAllowance <== AllowanceAmount - TransferAmount;
    
    component checkNewAllowance = CheckReceiverValue();
    checkNewAllowance.receiverValue <== remainingAllowance;
    checkNewAllowance.receiverPublicKey[0] <== SpenderPublicKey[0];
    checkNewAllowance.receiverPublicKey[1] <== SpenderPublicKey[1];
    checkNewAllowance.receiverRandom <== NewAllowanceRandom;
    checkNewAllowance.receiverValueC1[0] <== NewAllowanceC1[0];
    checkNewAllowance.receiverValueC1[1] <== NewAllowanceC1[1];
    checkNewAllowance.receiverValueC2[0] <== NewAllowanceC2[0];
    checkNewAllowance.receiverValueC2[1] <== NewAllowanceC2[1];
    
    // 6. Verify receiver's encrypted amount
    component checkReceiverAmount = CheckReceiverValue();
    checkReceiverAmount.receiverValue <== TransferAmount;
    checkReceiverAmount.receiverPublicKey[0] <== ReceiverPublicKey[0];
    checkReceiverAmount.receiverPublicKey[1] <== ReceiverPublicKey[1];
    checkReceiverAmount.receiverRandom <== ReceiverRandom;
    checkReceiverAmount.receiverValueC1[0] <== ReceiverAmountC1[0];
    checkReceiverAmount.receiverValueC1[1] <== ReceiverAmountC1[1];
    checkReceiverAmount.receiverValueC2[0] <== ReceiverAmountC2[0];
    checkReceiverAmount.receiverValueC2[1] <== ReceiverAmountC2[1];
    
    // 7. Verify receiver's PCT
    component checkReceiverPCT = CheckPCT();
    checkReceiverPCT.publicKey[0] <== ReceiverPublicKey[0];
    checkReceiverPCT.publicKey[1] <== ReceiverPublicKey[1];
    checkReceiverPCT.pct <== ReceiverPCT;
    checkReceiverPCT.authKey[0] <== ReceiverPCTAuthKey[0];
    checkReceiverPCT.authKey[1] <== ReceiverPCTAuthKey[1];
    checkReceiverPCT.nonce <== ReceiverPCTNonce;
    checkReceiverPCT.random <== ReceiverPCTRandom;
    checkReceiverPCT.value <== TransferAmount;
    
    // 8. Verify auditor's PCT
    component checkAuditorPCT = CheckPCT();
    checkAuditorPCT.publicKey[0] <== AuditorPublicKey[0];
    checkAuditorPCT.publicKey[1] <== AuditorPublicKey[1];
    checkAuditorPCT.pct <== AuditorPCT;
    checkAuditorPCT.authKey[0] <== AuditorPCTAuthKey[0];
    checkAuditorPCT.authKey[1] <== AuditorPCTAuthKey[1];
    checkAuditorPCT.nonce <== AuditorPCTNonce;
    checkAuditorPCT.random <== AuditorPCTRandom;
    checkAuditorPCT.value <== TransferAmount;
}

component main { public [ 
    ApproverPublicKey, SpenderPublicKey, ReceiverPublicKey,
    AllowanceC1, AllowanceC2,
    NewAllowanceC1, NewAllowanceC2,
    ReceiverAmountC1, ReceiverAmountC2,
    ReceiverPCT, ReceiverPCTAuthKey, ReceiverPCTNonce,
    AuditorPublicKey, AuditorPCT, AuditorPCTAuthKey, AuditorPCTNonce
] } = ConfidentialTransferFromCircuit();
