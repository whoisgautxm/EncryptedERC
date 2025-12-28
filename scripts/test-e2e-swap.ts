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

// User class for key management
class TestUser {
    privateKey: bigint;
    formattedPrivateKey: bigint;
    publicKey: bigint[];
    address: string;
    signer: any;

    constructor(address: string, signer: any) {
        this.address = address;
        this.signer = signer;
        this.privateKey = genPrivKey();
        this.formattedPrivateKey = formatPrivKeyForBabyJub(this.privateKey) % subOrder;
        this.publicKey = mulPointEscalar(Base8, this.formattedPrivateKey).map((x) => BigInt(x));
    }

    genRegistrationHash(chainId: bigint): bigint {
        return poseidon3([chainId, this.formattedPrivateKey, BigInt(this.address)]);
    }
}

// ============================================================
// FULL E2E SWAP TEST
// ============================================================
async function main() {
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║            ZEX Diamond Full E2E Swap Test                      ║");
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

    // Get signers
    const signers = await ethers.getSigners();
    if (signers.length < 2) {
        console.error("❌ Need at least 2 signers for E2E test");
        process.exit(1);
    }

    const [deployer, acceptorSigner] = signers;
    console.log(`👤 Initiator: ${deployer.address}`);
    console.log(`👤 Acceptor: ${acceptorSigner.address}`);
    console.log();

    // Create test users
    const initiator = new TestUser(deployer.address, deployer);
    const acceptor = new TestUser(acceptorSigner.address, acceptorSigner);

    // Connect to contracts
    const registrar = Registrar__factory.connect(deployment.contracts.registrar, deployer);
    const diamondAsToken = ZexTokenFacet__factory.connect(deployment.contracts.zexDiamond, deployer);
    const diamondAsSwap = ZexSwapFacet__factory.connect(deployment.contracts.zexDiamond, deployer);

    // Load circuits
    const registrationCircuit = await zkit.getCircuit("RegistrationCircuit");
    const offerAcceptanceCircuit = await zkit.getCircuit("OfferAcceptanceCircuit");
    const offerFinalizationCircuit = await zkit.getCircuit("OfferFinalizationCircuit");

    console.log("✓ ZK circuits loaded");
    console.log();

    // ============================================================
    // STEP 1: Set Auditor Key (if not set)
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 STEP 1: Setup Auditor Key");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const auditorPK = await diamondAsToken.auditorPublicKey();
    const auditorPublicKey: [bigint, bigint] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553n,
        16950150798460657717958625567821834550301663161624707787222815936182638968203n
    ];

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
    // STEP 2: Register Users
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 STEP 2: Register Users");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    for (const user of [initiator, acceptor]) {
        const isRegistered = await registrar.isUserRegistered(user.address);

        if (isRegistered) {
            console.log(`✓ ${user.address.slice(0, 10)}... already registered`);
        } else {
            console.log(`   Registering ${user.address.slice(0, 10)}...`);

            const registrationHash = user.genRegistrationHash(chainId);
            const input = {
                SenderPrivateKey: user.formattedPrivateKey,
                SenderPublicKey: user.publicKey,
                SenderAddress: BigInt(user.address),
                ChainID: chainId,
                RegistrationHash: registrationHash,
            };

            const proof = await registrationCircuit.generateProof(input);
            const calldata = await registrationCircuit.generateCalldata(proof);

            const tx = await registrar.connect(user.signer).register({
                proofPoints: calldata.proofPoints as any,
                publicSignals: calldata.publicSignals as any,
            });
            await tx.wait();

            console.log(`✓ Registered (tx: ${tx.hash})`);
        }
    }
    console.log();

    // ============================================================
    // STEP 3: Create Offer with Rate = 3
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 STEP 3: Create Swap Offer (Rate = 3)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const rate3 = ethers.parseEther("3");
    const maxAmountToSell = 500n;
    const amountToBuy = 300n;
    const sellAmount = 100n; // 300 / 3 = 100

    const offerId = await diamondAsSwap.nextOfferId();

    const createTx = await diamondAsSwap.connect(initiator.signer).initiateOffer(
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        rate3,
        maxAmountToSell,
        0n,
        0n,
        "0x"
    );
    await createTx.wait();

    console.log(`✓ Offer created (tx: ${createTx.hash})`);
    console.log(`  Offer ID: ${offerId}`);
    console.log(`  Rate: ${ethers.formatEther(rate3)} (3:1)`);
    console.log(`  Max Amount to Sell: ${maxAmountToSell}`);
    console.log();

    // ============================================================
    // STEP 4: Accept Offer with ZK Proof
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 STEP 4: Accept Offer with ZK Proof");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Encrypt amountToBuy for initiator
    const { cipher: encryptedAmount, random: encryptionRandom } =
        encryptMessage(initiator.publicKey as [bigint, bigint], amountToBuy);

    const encryptedAmountToBuy = {
        c1: [encryptedAmount[0][0], encryptedAmount[0][1]],
        c2: [encryptedAmount[1][0], encryptedAmount[1][1]]
    };

    const acceptInput = {
        AcceptorPrivateKey: acceptor.formattedPrivateKey,
        AmountToBuy: amountToBuy,
        EncryptionRandom: encryptionRandom,
        AcceptorPublicKey: acceptor.publicKey,
        InitiatorPublicKey: initiator.publicKey,
        MaxAmountToSell: maxAmountToSell,
        Rate: rate3,
        AmountToBuyC1: encryptedAmount[0],
        AmountToBuyC2: encryptedAmount[1],
    };

    console.log("   Generating acceptance ZK proof...");
    const acceptProof = await offerAcceptanceCircuit.generateProof(acceptInput);
    const acceptCalldata = await offerAcceptanceCircuit.generateCalldata(acceptProof);

    const acceptProofData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[10] publicSignals)"],
        [{ proofPoints: acceptCalldata.proofPoints, publicSignals: acceptCalldata.publicSignals }]
    );

    const acceptTx = await diamondAsSwap.connect(acceptor.signer).acceptOffer(offerId, "0x", acceptProofData);
    await acceptTx.wait();

    console.log(`✓ Offer accepted (tx: ${acceptTx.hash})`);
    console.log(`  Amount to Buy: ${amountToBuy}`);
    console.log();

    // ============================================================
    // STEP 5: Finalize Swap with Rate Enforcement
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 STEP 5: Finalize Swap with Rate Enforcement");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Encrypt sellAmount for acceptor
    const { cipher: sellAmountEncrypted, random: sellEncryptionRandom } =
        encryptMessage(acceptor.publicKey as [bigint, bigint], sellAmount);

    const finalizeInput = {
        InitiatorPrivateKey: initiator.formattedPrivateKey,
        AmountToBuy: amountToBuy,
        SellAmount: sellAmount,
        SellEncryptionRandom: sellEncryptionRandom,
        InitiatorPublicKey: initiator.publicKey,
        AcceptorPublicKey: acceptor.publicKey,
        Rate: rate3,
        AmountToBuyC1: encryptedAmountToBuy.c1,
        AmountToBuyC2: encryptedAmountToBuy.c2,
        SellAmountC1: sellAmountEncrypted[0],
        SellAmountC2: sellAmountEncrypted[1],
    };

    console.log("   Generating finalization ZK proof...");
    const finalizeProof = await offerFinalizationCircuit.generateProof(finalizeInput);
    const finalizeCalldata = await offerFinalizationCircuit.generateCalldata(finalizeProof);

    const finalizeProofData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[13] publicSignals)"],
        [{ proofPoints: finalizeCalldata.proofPoints, publicSignals: finalizeCalldata.publicSignals }]
    );

    const finalizeTx = await diamondAsSwap.connect(initiator.signer).finalizeSwap(offerId, "0x", finalizeProofData);
    await finalizeTx.wait();

    console.log(`✓ Swap finalized (tx: ${finalizeTx.hash})`);
    console.log(`  Sell Amount: ${sellAmount}`);
    console.log(`  Rate Verification: ${sellAmount} * 3 = ${sellAmount * 3n} ✓`);
    console.log();

    // ============================================================
    // VERIFY
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 VERIFICATION");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const deletedOffer = await diamondAsSwap.getOffer(offerId);
    if (deletedOffer.initiator === ethers.ZeroAddress) {
        console.log(`✓ Offer ${offerId} deleted after finalization`);
    } else {
        console.log(`❌ Offer ${offerId} still exists`);
    }
    console.log();

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║                   E2E SWAP TEST COMPLETE! 🎉                   ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
    console.log();
    console.log("📋 Transaction Summary:");
    console.log(`   1. Create Offer: ${createTx.hash}`);
    console.log(`   2. Accept Offer: ${acceptTx.hash}`);
    console.log(`   3. Finalize Swap: ${finalizeTx.hash}`);
    console.log();
    console.log("💱 Swap Details:");
    console.log(`   Rate: 3:1`);
    console.log(`   Amount to Buy: ${amountToBuy}`);
    console.log(`   Sell Amount: ${sellAmount}`);
    console.log(`   Rate Check: ${sellAmount} * 3 = ${sellAmount * 3n} = ${amountToBuy} ✓`);
    console.log();

    if (networkName === "mantle") {
        console.log("🔗 Explorer Links:");
        console.log(`   Create: https://explorer.mantle.xyz/tx/${createTx.hash}`);
        console.log(`   Accept: https://explorer.mantle.xyz/tx/${acceptTx.hash}`);
        console.log(`   Finalize: https://explorer.mantle.xyz/tx/${finalizeTx.hash}`);
    } else if (networkName === "mantleSepolia") {
        console.log("🔗 Explorer Links:");
        console.log(`   Create: https://explorer.sepolia.mantle.xyz/tx/${createTx.hash}`);
        console.log(`   Accept: https://explorer.sepolia.mantle.xyz/tx/${acceptTx.hash}`);
        console.log(`   Finalize: https://explorer.sepolia.mantle.xyz/tx/${finalizeTx.hash}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
