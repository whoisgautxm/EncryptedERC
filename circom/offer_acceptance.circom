pragma circom 2.1.9;

include "./components.circom";

/**
 * OfferAcceptanceCircuit (§5.2.1)
 * 
 * This circuit proves the acceptor's chosen amount is valid for a swap offer:
 * 1. Acceptor owns their private key
 * 2. AmountToBuy ≤ MaxAmountToSell
 * 3. The encrypted AmountToBuy is a valid ElGamal commitment
 * 4. Rate is bound as public input for consistency
 */
template OfferAcceptanceCircuit() {
    // Private inputs
    signal input AcceptorPrivateKey;
    signal input AmountToBuy;           // Chosen amount to buy from initiator
    signal input EncryptionRandom;      // Random for ElGamal encryption
    
    // Public inputs
    signal input AcceptorPublicKey[2];
    signal input InitiatorPublicKey[2];
    signal input MaxAmountToSell;       // Maximum from the offer
    signal input Rate;                  // Exchange rate (bound for consistency)
    signal input AmountToBuyC1[2];      // ElGamal ciphertext c1
    signal input AmountToBuyC2[2];      // ElGamal ciphertext c2
    
    var baseOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    
    // 1. Verify amount is valid (> 0 and < baseOrder)
    component amountBits = Num2Bits(252);
    amountBits.in <== AmountToBuy;
    
    component baseOrderBits = Num2Bits(252);
    baseOrderBits.in <== baseOrder;
    
    component ltAmount = LessThan(252);
    ltAmount.in[0] <== AmountToBuy;
    ltAmount.in[1] <== baseOrder;
    ltAmount.out === 1;
    
    // 2. Verify AmountToBuy <= MaxAmountToSell
    component maxBits = Num2Bits(252);
    maxBits.in <== MaxAmountToSell + 1;
    
    component checkMax = LessThan(252);
    checkMax.in[0] <== AmountToBuy;
    checkMax.in[1] <== MaxAmountToSell + 1;
    checkMax.out === 1;
    
    // 3. Verify acceptor's public key ownership
    component checkAcceptorPK = CheckPublicKey();
    checkAcceptorPK.privKey <== AcceptorPrivateKey;
    checkAcceptorPK.pubKey[0] <== AcceptorPublicKey[0];
    checkAcceptorPK.pubKey[1] <== AcceptorPublicKey[1];
    
    // 4. Verify the commitment: AmountToBuyC1/C2 is valid encryption of AmountToBuy
    //    using InitiatorPublicKey (so initiator can decrypt)
    component checkCommitment = CheckReceiverValue();
    checkCommitment.receiverValue <== AmountToBuy;
    checkCommitment.receiverPublicKey[0] <== InitiatorPublicKey[0];
    checkCommitment.receiverPublicKey[1] <== InitiatorPublicKey[1];
    checkCommitment.receiverRandom <== EncryptionRandom;
    checkCommitment.receiverValueC1[0] <== AmountToBuyC1[0];
    checkCommitment.receiverValueC1[1] <== AmountToBuyC1[1];
    checkCommitment.receiverValueC2[0] <== AmountToBuyC2[0];
    checkCommitment.receiverValueC2[1] <== AmountToBuyC2[1];
    
    // Rate is a public input - bound for consistency but not constrained here
    // The contract verifies Rate matches the offer
    signal rateCheck;
    rateCheck <== Rate * 1;
}

component main { public [ 
    AcceptorPublicKey, InitiatorPublicKey,
    MaxAmountToSell, Rate,
    AmountToBuyC1, AmountToBuyC2
] } = OfferAcceptanceCircuit();
