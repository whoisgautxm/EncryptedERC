pragma circom 2.1.9;

include "./components.circom";

/**
 * OfferFinalizationCircuit (§5.2.2)
 * 
 * This circuit proves the initiator correctly computed the sell amount:
 * 1. Initiator owns their private key
 * 2. Initiator correctly decrypted AmountToBuy from ciphertext
 * 3. SellAmount equals the decrypted AmountToBuy (rate applied by acceptor)
 * 4. SellAmount is correctly encrypted for the acceptor
 */
template OfferFinalizationCircuit() {
    // Private inputs
    signal input InitiatorPrivateKey;
    signal input AmountToBuy;           // Decrypted from ciphertext
    signal input SellAmount;            // Amount to sell (should equal AmountToBuy)
    signal input SellEncryptionRandom;  // Random for encrypting SellAmount
    
    // Public inputs
    signal input InitiatorPublicKey[2];
    signal input AcceptorPublicKey[2];
    signal input Rate;                  // Exchange rate (bound for consistency)
    signal input AmountToBuyC1[2];      // Encrypted amount acceptor will pay
    signal input AmountToBuyC2[2];
    signal input SellAmountC1[2];       // Encrypted amount initiator will sell
    signal input SellAmountC2[2];
    
    var baseOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    
    // 1. Verify amounts are valid
    component amountBuyBits = Num2Bits(252);
    amountBuyBits.in <== AmountToBuy;
    
    component sellAmountBits = Num2Bits(252);
    sellAmountBits.in <== SellAmount;
    
    component baseOrderBits = Num2Bits(252);
    baseOrderBits.in <== baseOrder;
    
    component ltBuy = LessThan(252);
    ltBuy.in[0] <== AmountToBuy;
    ltBuy.in[1] <== baseOrder;
    ltBuy.out === 1;
    
    component ltSell = LessThan(252);
    ltSell.in[0] <== SellAmount;
    ltSell.in[1] <== baseOrder;
    ltSell.out === 1;
    
    // 2. Verify initiator's public key ownership
    component checkInitiatorPK = CheckPublicKey();
    checkInitiatorPK.privKey <== InitiatorPrivateKey;
    checkInitiatorPK.pubKey[0] <== InitiatorPublicKey[0];
    checkInitiatorPK.pubKey[1] <== InitiatorPublicKey[1];
    
    // 3. Verify initiator correctly decrypted AmountToBuy
    //    The acceptor encrypted AmountToBuy with InitiatorPublicKey
    component checkDecryption = CheckValue();
    checkDecryption.value <== AmountToBuy;
    checkDecryption.privKey <== InitiatorPrivateKey;
    checkDecryption.valueC1[0] <== AmountToBuyC1[0];
    checkDecryption.valueC1[1] <== AmountToBuyC1[1];
    checkDecryption.valueC2[0] <== AmountToBuyC2[0];
    checkDecryption.valueC2[1] <== AmountToBuyC2[1];
    
    // 4. Verify SellAmount with Rate enforcement
    //    Formula: SellAmount * Rate = AmountToBuy * RATE_PRECISION
    //    Where RATE_PRECISION = 1e18 (matches Solidity scaling)
    //    This ensures: SellAmount = AmountToBuy * RATE_PRECISION / Rate
    //    
    //    Rate interpretation (scaled by 1e18):
    //    - Rate = 1e18: 1:1 exchange (SellAmount = AmountToBuy)
    //    - Rate = 2e18: 2 assetBuy per 1 assetSell (initiator gets 2x value)
    //    - Rate = 5e17: 0.5 assetBuy per 1 assetSell
    //
    //    Note: Any rounding must be done off-chain before proof generation.
    //    The circuit enforces exact equality.
    var RATE_PRECISION = 1000000000000000000; // 1e18
    
    signal rateProduct;
    rateProduct <== SellAmount * Rate;
    
    signal expectedProduct;
    expectedProduct <== AmountToBuy * RATE_PRECISION;
    
    rateProduct === expectedProduct;
    
    // 5. Verify SellAmount is correctly encrypted for acceptor
    component checkSellEncryption = CheckReceiverValue();
    checkSellEncryption.receiverValue <== SellAmount;
    checkSellEncryption.receiverPublicKey[0] <== AcceptorPublicKey[0];
    checkSellEncryption.receiverPublicKey[1] <== AcceptorPublicKey[1];
    checkSellEncryption.receiverRandom <== SellEncryptionRandom;
    checkSellEncryption.receiverValueC1[0] <== SellAmountC1[0];
    checkSellEncryption.receiverValueC1[1] <== SellAmountC1[1];
    checkSellEncryption.receiverValueC2[0] <== SellAmountC2[0];
    checkSellEncryption.receiverValueC2[1] <== SellAmountC2[1];
}

component main { public [ 
    InitiatorPublicKey, AcceptorPublicKey,
    Rate,
    AmountToBuyC1, AmountToBuyC2,
    SellAmountC1, SellAmountC2
] } = OfferFinalizationCircuit();
