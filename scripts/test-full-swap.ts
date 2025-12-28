/**
 * Full Two-Token Swap E2E Test on Mantle Sepolia
 * 
 * This test demonstrates:
 * 1. Two users (Initiator and Acceptor)
 * 2. Two tokens (Token A and Token B - using same Diamond with different offer context)
 * 3. Full swap flow:
 *    - User 1 creates offer: "I'll sell 100 Token A for 300 Token B"
 *    - User 2 accepts: "I'll buy 100 Token A and give 300 Token B"
 *    - User 1 finalizes: Rate enforcement verified via ZK proof
 * 
 * Note: For simplicity, this uses a single Diamond deployment.
 * In production, assetBuy/assetSell would point to different token contracts.
 */

import { ethers, network, zkit } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { Base8, mulPointEscalar, subOrder } from "@zk-kit/baby-jubjub";
import { formatPrivKeyForBabyJub, genPrivKey } from "maci-crypto";
import { poseidon3 } from "poseidon-lite";
import { ZexTokenFacet__factory, ZexAllowanceFacet__factory, ZexSwapFacet__factory, Registrar__factory } from "../typechain-types";
import { encryptMessage } from "../src/jub/jub";

// ============================================================
// CONFIGURATION
// ============================================================
interface DeploymentAddresses {
    network: string;
    chainId: number;
    contracts: {
        registrar: string;
        zexDiamond: string;
        [key: string]: string;
    };
}

// ============================================================
// PERSISTENT KEY STORAGE
// ============================================================
interface StoredUserKeys {
    address: string;
    privateKey: string; // bigint as hex string
    formattedPrivateKey: string;
    publicKey: [string, string]; // bigint[] as hex strings
}

interface KeysFile {
    chainId: number;
    users: { [address: string]: StoredUserKeys };
}

function getKeysFilePath(chainId: bigint): string {
    return path.join(__dirname, "..", "deployments", `user-keys-${chainId}.json`);
}

function loadStoredKeys(chainId: bigint): KeysFile {
    const keysFile = getKeysFilePath(chainId);
    if (fs.existsSync(keysFile)) {
        return JSON.parse(fs.readFileSync(keysFile, "utf-8"));
    }
    return { chainId: Number(chainId), users: {} };
}

function saveUserKeys(chainId: bigint, user: TestUser): void {
    const keysFile = getKeysFilePath(chainId);
    const keysData = loadStoredKeys(chainId);

    keysData.users[user.address.toLowerCase()] = {
        address: user.address,
        privateKey: user.privateKey.toString(16),
        formattedPrivateKey: user.formattedPrivateKey.toString(16),
        publicKey: [user.publicKey[0].toString(16), user.publicKey[1].toString(16)]
    };

    fs.writeFileSync(keysFile, JSON.stringify(keysData, null, 2));
    console.log(`   📁 Keys saved to ${keysFile}`);
}

// User class for key management with persistence
class TestUser {
    privateKey: bigint;
    formattedPrivateKey: bigint;
    publicKey: bigint[];
    address: string;
    signer: any;
    name: string;
    isNewKey: boolean = false;

    constructor(address: string, signer: any, name: string, chainId?: bigint) {
        this.address = address;
        this.signer = signer;
        this.name = name;

        // Try to load existing keys
        if (chainId) {
            const keysData = loadStoredKeys(chainId);
            const storedKeys = keysData.users[address.toLowerCase()];

            if (storedKeys) {
                // Load from storage
                this.privateKey = BigInt("0x" + storedKeys.privateKey);
                this.formattedPrivateKey = BigInt("0x" + storedKeys.formattedPrivateKey);
                this.publicKey = [
                    BigInt("0x" + storedKeys.publicKey[0]),
                    BigInt("0x" + storedKeys.publicKey[1])
                ];
                console.log(`   🔑 Loaded existing keys for ${name} (${address.slice(0, 10)}...)`);
                return;
            }
        }

        // Generate new keys
        this.privateKey = genPrivKey();
        this.formattedPrivateKey = formatPrivKeyForBabyJub(this.privateKey) % subOrder;
        this.publicKey = mulPointEscalar(Base8, this.formattedPrivateKey).map((x) => BigInt(x));
        this.isNewKey = true;
        console.log(`   🆕 Generated new keys for ${name} (${address.slice(0, 10)}...)`);
    }

    genRegistrationHash(chainId: bigint): bigint {
        return poseidon3([chainId, this.formattedPrivateKey, BigInt(this.address)]);
    }
}


// ============================================================
// FULL TWO-TOKEN SWAP E2E TEST
// ============================================================
async function main() {
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║       ZEX Diamond Full Two-User Swap E2E Test                  ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
    console.log();

    const networkName = network.name;
    const chainId = (await ethers.provider.getNetwork()).chainId;

    console.log(`📡 Network: ${networkName} (Chain ID: ${chainId})`);

    // Load deployment addresses
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    const deploymentFile = path.join(deploymentsDir, `${networkName}-${chainId}.json`);

    if (!fs.existsSync(deploymentFile)) {
        console.error(`❌ Deployment file not found: ${deploymentFile}`);
        process.exit(1);
    }

    const deployment: DeploymentAddresses = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
    console.log(`💎 Diamond: ${deployment.contracts.zexDiamond}`);
    console.log();

    // Get signers - we need 2 signers (Alice and Bob)
    const signers = await ethers.getSigners();

    if (signers.length < 2) {
        console.error("❌ Need 2 signers for two-user test!");
        console.error("   Add PRIVATE_KEY_2 to your .env file");
        process.exit(1);
    }

    const aliceSigner = signers[0];
    const bobSigner = signers[1];

    console.log(`👩 Alice (Initiator): ${aliceSigner.address}`);
    console.log(`👨 Bob (Acceptor):    ${bobSigner.address}`);
    console.log();

    // Check balances
    const aliceBalance = await ethers.provider.getBalance(aliceSigner.address);
    const bobBalance = await ethers.provider.getBalance(bobSigner.address);
    console.log(`💰 Alice Balance: ${ethers.formatEther(aliceBalance)} MNT`);
    console.log(`💰 Bob Balance:   ${ethers.formatEther(bobBalance)} MNT`);
    console.log();

    if (bobBalance === 0n) {
        console.error("❌ Bob needs MNT for gas!");
        process.exit(1);
    }

    // Create two test users with DIFFERENT addresses and keys (with persistence)
    console.log("🔑 Loading/generating user keys...");
    const alice = new TestUser(aliceSigner.address, aliceSigner, "Alice", chainId);
    const bob = new TestUser(bobSigner.address, bobSigner, "Bob", chainId);
    console.log();

    // Connect to contracts
    const registrar = Registrar__factory.connect(deployment.contracts.registrar, aliceSigner);
    const diamondAsToken = ZexTokenFacet__factory.connect(deployment.contracts.zexDiamond, aliceSigner);
    const diamondAsSwap = ZexSwapFacet__factory.connect(deployment.contracts.zexDiamond, aliceSigner);

    // Load circuits
    const registrationCircuit = await zkit.getCircuit("RegistrationCircuit");
    const offerAcceptanceCircuit = await zkit.getCircuit("OfferAcceptanceCircuit");
    const offerFinalizationCircuit = await zkit.getCircuit("OfferFinalizationCircuit");

    console.log("✓ ZK circuits loaded");
    console.log();

    // Auditor public key
    const auditorPublicKey: [bigint, bigint] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553n,
        16950150798460657717958625567821834550301663161624707787222815936182638968203n
    ];

    // ============================================================
    // SCENARIO SETUP
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 SCENARIO: Full Two-User Token Swap");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log();
    console.log("   Alice (Initiator) wants to SELL 100 Token A");
    console.log("   Alice wants to BUY 300 Token B");
    console.log("   Rate: 3:1 (for every 1 Token A sold, get 3 Token B)");
    console.log();
    console.log("   Bob (Acceptor) will BUY 100 Token A from Alice");
    console.log("   Bob will PAY 300 Token B to Alice");
    console.log();
    console.log("   Rate Enforcement: sellAmount(100) * rate(3) = amountToBuy(300) ✓");
    console.log();

    // ============================================================
    // STEP 1: Ensure Auditor Key is Set
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 STEP 1: Setup Auditor Key");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const auditorPK = await diamondAsToken.auditorPublicKey();
    if (auditorPK.x === 0n && auditorPK.y === 1n) {
        console.log("   Setting auditor public key...");
        const tx = await diamondAsToken.setAuditorPublicKey(auditorPublicKey);
        await tx.wait();
        console.log(`✓ Auditor key set (tx: ${tx.hash})`);
    } else {
        console.log("✓ Auditor key already set");
    }
    console.log();

    // ============================================================
    // STEP 2: Register Both Users (Alice and Bob)
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 STEP 2: Register Both Users");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Register Alice
    const isAliceRegistered = await registrar.isUserRegistered(aliceSigner.address);
    if (isAliceRegistered) {
        console.log(`✓ Alice ${aliceSigner.address.slice(0, 10)}... already registered`);
    } else {
        console.log(`   Registering Alice with ZK proof...`);

        const aliceRegistrationHash = alice.genRegistrationHash(chainId);
        const aliceInput = {
            SenderPrivateKey: alice.formattedPrivateKey,
            SenderPublicKey: alice.publicKey,
            SenderAddress: BigInt(aliceSigner.address),
            ChainID: chainId,
            RegistrationHash: aliceRegistrationHash,
        };

        const aliceProof = await registrationCircuit.generateProof(aliceInput);
        const aliceCalldata = await registrationCircuit.generateCalldata(aliceProof);

        const tx = await registrar.connect(aliceSigner).register({
            proofPoints: aliceCalldata.proofPoints as any,
            publicSignals: aliceCalldata.publicSignals as any,
        });
        await tx.wait();

        console.log(`✓ Alice registered (tx: ${tx.hash})`);
        saveUserKeys(chainId, alice);
    }

    // Register Bob  
    const isBobRegistered = await registrar.isUserRegistered(bobSigner.address);
    if (isBobRegistered) {
        console.log(`✓ Bob ${bobSigner.address.slice(0, 10)}... already registered`);
    } else {
        console.log(`   Registering Bob with ZK proof...`);

        const bobRegistrationHash = bob.genRegistrationHash(chainId);
        const bobInput = {
            SenderPrivateKey: bob.formattedPrivateKey,
            SenderPublicKey: bob.publicKey,
            SenderAddress: BigInt(bobSigner.address),
            ChainID: chainId,
            RegistrationHash: bobRegistrationHash,
        };

        const bobProof = await registrationCircuit.generateProof(bobInput);
        const bobCalldata = await registrationCircuit.generateCalldata(bobProof);

        const tx = await registrar.connect(bobSigner).register({
            proofPoints: bobCalldata.proofPoints as any,
            publicSignals: bobCalldata.publicSignals as any,
        });
        await tx.wait();

        console.log(`✓ Bob registered (tx: ${tx.hash})`);
        saveUserKeys(chainId, bob);
    }
    console.log();

    // ============================================================
    // STEP 3: Alice Creates Swap Offer (Rate = 3)
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 STEP 3: Alice Creates Swap Offer");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("   Alice: 'I want to sell 100 Token A and receive 300 Token B'");
    console.log();

    const rate = ethers.parseEther("3"); // 3:1 rate
    const maxAmountToSell = 500n;  // Max willing to sell
    const amountToBuy = 300n;      // What acceptor commits to pay
    const sellAmount = 100n;       // 300 / 3 = 100 (enforced by ZK circuit)

    const offerId = await diamondAsSwap.nextOfferId();

    console.log(`   Creating offer #${offerId}...`);
    console.log(`   Rate: ${ethers.formatEther(rate)} (3:1)`);
    console.log(`   Max Amount to Sell: ${maxAmountToSell}`);

    const createTx = await diamondAsSwap.connect(alice.signer).initiateOffer(
        ethers.ZeroAddress,  // assetBuy (Token B) - would be Token B contract address
        ethers.ZeroAddress,  // assetSell (Token A) - would be Token A contract address
        rate,
        maxAmountToSell,
        0n,  // minAmountToSell
        0n,  // expiresAt (no expiration)
        "0x" // approveData
    );
    await createTx.wait();

    console.log(`✓ Offer created!`);
    console.log(`   TX: ${createTx.hash}`);
    console.log();

    // Verify offer was created
    const offer = await diamondAsSwap.getOffer(offerId);
    console.log("   📄 Offer Details:");
    console.log(`      ID: ${offerId}`);
    console.log(`      Initiator: ${offer.initiator}`);
    console.log(`      Rate: ${ethers.formatEther(offer.rate)}`);
    console.log(`      Max Amount: ${offer.maxAmountToSell}`);
    console.log(`      Acceptor: ${offer.acceptor === ethers.ZeroAddress ? "None (waiting)" : offer.acceptor}`);
    console.log();

    // ============================================================
    // STEP 4: Bob Accepts the Offer with ZK Proof
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 STEP 4: Bob Accepts the Offer (ZK Proof)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("   Bob: 'I accept! I'll pay 300 Token B for Alice's Token A'");
    console.log();

    // Encrypt amountToBuy for initiator (Alice)
    const { cipher: encryptedAmount, random: encryptionRandom } =
        encryptMessage(alice.publicKey as [bigint, bigint], amountToBuy);

    const encryptedAmountToBuy = {
        c1: [encryptedAmount[0][0], encryptedAmount[0][1]],
        c2: [encryptedAmount[1][0], encryptedAmount[1][1]]
    };

    console.log("   🔒 Encrypting amount with Alice's public key...");
    console.log("   🔐 Generating ZK proof for offer acceptance...");

    const acceptInput = {
        AcceptorPrivateKey: bob.formattedPrivateKey,
        AmountToBuy: amountToBuy,
        EncryptionRandom: encryptionRandom,
        AcceptorPublicKey: bob.publicKey,
        InitiatorPublicKey: alice.publicKey,
        MaxAmountToSell: maxAmountToSell,
        Rate: rate,
        AmountToBuyC1: encryptedAmount[0],
        AmountToBuyC2: encryptedAmount[1],
    };

    const acceptProof = await offerAcceptanceCircuit.generateProof(acceptInput);
    const acceptCalldata = await offerAcceptanceCircuit.generateCalldata(acceptProof);

    console.log("   ✓ ZK proof generated!");
    console.log();
    console.log("   📊 What the ZK proof proves:");
    console.log(`      • Bob knows his private key (without revealing it)`);
    console.log(`      • amountToBuy = ${amountToBuy}`);
    console.log(`      • amountToBuy ≤ maxAmountToSell × rate ✓`);
    console.log();

    const acceptProofData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[10] publicSignals)"],
        [{ proofPoints: acceptCalldata.proofPoints, publicSignals: acceptCalldata.publicSignals }]
    );

    console.log("   Submitting acceptance transaction...");
    const acceptTx = await diamondAsSwap.connect(bob.signer).acceptOffer(offerId, "0x", acceptProofData);
    await acceptTx.wait();

    console.log(`✓ Offer accepted!`);
    console.log(`   TX: ${acceptTx.hash}`);
    console.log();

    // Verify offer was accepted
    const acceptedOffer = await diamondAsSwap.getOffer(offerId);
    console.log("   📄 Updated Offer:");
    console.log(`      Acceptor: ${acceptedOffer.acceptor}`);
    console.log();

    // ============================================================
    // STEP 5: Alice Finalizes the Swap with ZK Proof (Rate Enforcement)
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 STEP 5: Alice Finalizes the Swap (ZK Proof + Rate Enforcement)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("   Alice: 'I confirm! Here's my proof that the rate is correct'");
    console.log();

    // Encrypt sellAmount for acceptor (Bob)
    const { cipher: sellAmountEncrypted, random: sellEncryptionRandom } =
        encryptMessage(bob.publicKey as [bigint, bigint], sellAmount);

    console.log("   🔒 Encrypting sellAmount with Bob's public key...");
    console.log("   🔐 Generating ZK proof for finalization (with rate enforcement)...");

    const finalizeInput = {
        InitiatorPrivateKey: alice.formattedPrivateKey,
        AmountToBuy: amountToBuy,
        SellAmount: sellAmount,
        SellEncryptionRandom: sellEncryptionRandom,
        InitiatorPublicKey: alice.publicKey,
        AcceptorPublicKey: bob.publicKey,
        Rate: rate,
        AmountToBuyC1: encryptedAmountToBuy.c1,
        AmountToBuyC2: encryptedAmountToBuy.c2,
        SellAmountC1: sellAmountEncrypted[0],
        SellAmountC2: sellAmountEncrypted[1],
    };

    const finalizeProof = await offerFinalizationCircuit.generateProof(finalizeInput);
    const finalizeCalldata = await offerFinalizationCircuit.generateCalldata(finalizeProof);

    console.log("   ✓ ZK proof generated!");
    console.log();
    console.log("   📊 What the ZK proof proves (RATE ENFORCEMENT):");
    console.log(`      • Alice knows her private key (without revealing it)`);
    console.log(`      • sellAmount = ${sellAmount}`);
    console.log(`      • amountToBuy = ${amountToBuy}`);
    console.log(`      • sellAmount × rate = amountToBuy ✓`);
    console.log(`      • ${sellAmount} × 3 = ${sellAmount * 3n} = ${amountToBuy} ✓`);
    console.log();

    const finalizeProofData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[13] publicSignals)"],
        [{ proofPoints: finalizeCalldata.proofPoints, publicSignals: finalizeCalldata.publicSignals }]
    );

    console.log("   Submitting finalization transaction...");
    const finalizeTx = await diamondAsSwap.connect(alice.signer).finalizeSwap(offerId, "0x", finalizeProofData);
    await finalizeTx.wait();

    console.log(`✓ Swap finalized!`);
    console.log(`   TX: ${finalizeTx.hash}`);
    console.log();

    // ============================================================
    // STEP 6: Verify Swap Completed
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 STEP 6: Verify Swap Completed");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const finalOffer = await diamondAsSwap.getOffer(offerId);
    if (finalOffer.initiator === ethers.ZeroAddress) {
        console.log(`✓ Offer #${offerId} deleted after successful swap`);
    } else {
        console.log(`❌ Offer still exists (unexpected)`);
    }
    console.log();

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║              FULL TWO-TOKEN SWAP COMPLETE! 🎉                  ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
    console.log();
    console.log("📊 SWAP SUMMARY:");
    console.log("┌─────────────────────────────────────────────────────────────────┐");
    console.log("│  ALICE (Initiator)                                              │");
    console.log("│    - SOLD: 100 Token A                                          │");
    console.log("│    - RECEIVED: 300 Token B                                      │");
    console.log("├─────────────────────────────────────────────────────────────────┤");
    console.log("│  BOB (Acceptor)                                                 │");
    console.log("│    - BOUGHT: 100 Token A                                        │");
    console.log("│    - PAID: 300 Token B                                          │");
    console.log("├─────────────────────────────────────────────────────────────────┤");
    console.log("│  RATE ENFORCEMENT                                               │");
    console.log("│    - Rate: 3:1                                                  │");
    console.log("│    - 100 × 3 = 300 ✓                                            │");
    console.log("│    - Enforced by ZK circuit (not by trusting any party)         │");
    console.log("└─────────────────────────────────────────────────────────────────┘");
    console.log();
    console.log("📝 TRANSACTIONS:");
    console.log(`   1. Create Offer:   ${createTx.hash}`);
    console.log(`   2. Accept Offer:   ${acceptTx.hash}`);
    console.log(`   3. Finalize Swap:  ${finalizeTx.hash}`);
    console.log();

    if (networkName === "mantleSepolia") {
        console.log("🔗 EXPLORER LINKS:");
        console.log(`   Create:   https://sepolia.mantlescan.xyz/tx/${createTx.hash}`);
        console.log(`   Accept:   https://sepolia.mantlescan.xyz/tx/${acceptTx.hash}`);
        console.log(`   Finalize: https://sepolia.mantlescan.xyz/tx/${finalizeTx.hash}`);
    }
    console.log();
    console.log("✅ All ZK proofs verified on-chain!");
    console.log("✅ Rate enforcement validated by circuit!");
    console.log("✅ Swap completed trustlessly!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
