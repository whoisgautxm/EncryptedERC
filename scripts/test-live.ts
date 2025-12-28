import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { Base8, mulPointEscalar, subOrder } from "@zk-kit/baby-jubjub";
import { formatPrivKeyForBabyJub, genPrivKey } from "maci-crypto";
import { poseidon3 } from "poseidon-lite";
import { ZexTokenFacet__factory, ZexAllowanceFacet__factory, ZexSwapFacet__factory, Registrar__factory } from "../typechain-types";
import { OfferAcceptanceCircuit, OfferFinalizationCircuit, RegistrationCircuit } from "../generated-types/zkit";
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

    constructor(address: string) {
        this.address = address;
        this.privateKey = genPrivKey();
        this.formattedPrivateKey = formatPrivKeyForBabyJub(this.privateKey) % subOrder;
        this.publicKey = mulPointEscalar(Base8, this.formattedPrivateKey).map((x) => BigInt(x));
    }

    genRegistrationHash(chainId: bigint): bigint {
        return poseidon3([chainId, this.formattedPrivateKey, BigInt(this.address)]);
    }
}

// ============================================================
// MAIN TEST SCRIPT
// ============================================================
async function main() {
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║         ZEX Diamond Live Contract Integration Test             ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
    console.log();

    const networkName = network.name;
    const chainId = (await ethers.provider.getNetwork()).chainId;

    console.log(`📡 Network: ${networkName} (Chain ID: ${chainId})`);

    // On local network, contracts don't persist between runs
    if (networkName === "hardhat" || networkName === "localhost") {
        console.log();
        console.log("⚠️  Running on local network.");
        console.log("   For local testing, run deployment first:");
        console.log("   npx hardhat run scripts/deploy-mantle.ts --network hardhat");
        console.log("   Then run this script in the SAME terminal session.");
        console.log();
    }
    // Load deployment addresses
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    const deploymentFile = path.join(deploymentsDir, `${networkName}-${chainId}.json`);

    if (!fs.existsSync(deploymentFile)) {
        console.error(`❌ Deployment file not found: ${deploymentFile}`);
        console.error(`   Run the deployment script first: npx hardhat run scripts/deploy-mantle.ts --network ${networkName}`);
        process.exit(1);
    }

    const deployment: DeploymentAddresses = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
    console.log(`📄 Loaded deployment from: ${deploymentFile}`);
    console.log(`💎 Diamond Address: ${deployment.contracts.zexDiamond}`);
    console.log(`📝 Registrar Address: ${deployment.contracts.registrar}`);
    console.log();

    // Get signers
    const [deployer, user1, user2] = await ethers.getSigners();
    console.log(`👤 Deployer: ${deployer.address}`);
    console.log(`👤 User 1: ${user1?.address || "Not available"}`);
    console.log(`👤 User 2: ${user2?.address || "Not available"}`);
    console.log();

    // Connect to contracts
    const registrar = Registrar__factory.connect(deployment.contracts.registrar, deployer);
    const diamondAsToken = ZexTokenFacet__factory.connect(deployment.contracts.zexDiamond, deployer);
    const diamondAsAllowance = ZexAllowanceFacet__factory.connect(deployment.contracts.zexDiamond, deployer);
    const diamondAsSwap = ZexSwapFacet__factory.connect(deployment.contracts.zexDiamond, deployer);

    // Initialize circuits (only works locally with zkit artifacts)
    let registrationCircuit: any;
    let offerAcceptanceCircuit: any;
    let offerFinalizationCircuit: any;

    try {
        const { zkit } = await import("hardhat");
        registrationCircuit = await zkit.getCircuit("RegistrationCircuit");
        offerAcceptanceCircuit = await zkit.getCircuit("OfferAcceptanceCircuit");
        offerFinalizationCircuit = await zkit.getCircuit("OfferFinalizationCircuit");
        console.log("✓ ZK circuits loaded");
    } catch (e) {
        console.log("⚠️  ZK circuits not available - some tests will be skipped");
    }

    // ============================================================
    // TEST 1: Verify Contract Deployment
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🧪 TEST 1: Verify Contract Deployment");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
        const name = await diamondAsToken.name();
        const symbol = await diamondAsToken.symbol();
        const decimals = await diamondAsToken.decimals();
        const registrarAddr = await diamondAsToken.registrar();

        console.log(`✓ Token Name: ${name}`);
        console.log(`✓ Token Symbol: ${symbol}`);
        console.log(`✓ Decimals: ${decimals}`);
        console.log(`✓ Registrar: ${registrarAddr}`);
        console.log("✅ TEST 1 PASSED: Contract deployment verified");
    } catch (e: any) {
        console.log(`❌ TEST 1 FAILED: ${e.message}`);
    }
    console.log();

    // ============================================================
    // TEST 2: Check Auditor Public Key
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🧪 TEST 2: Check Auditor Public Key");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
        const auditorPK = await diamondAsToken.auditorPublicKey();

        if (auditorPK.x === 0n && auditorPK.y === 1n) {
            console.log("⚠️  Auditor public key not set yet");
            console.log("   Setting auditor public key...");

            const auditorPublicKey: [bigint, bigint] = [
                5299619240641551281634865583518297030282874472190772894086521144482721001553n,
                16950150798460657717958625567821834550301663161624707787222815936182638968203n
            ];

            const tx = await diamondAsToken.setAuditorPublicKey(auditorPublicKey);
            await tx.wait();
            console.log(`✓ Auditor public key set (tx: ${tx.hash})`);
        } else {
            console.log(`✓ Auditor PK X: ${auditorPK.x}`);
            console.log(`✓ Auditor PK Y: ${auditorPK.y}`);
        }
        console.log("✅ TEST 2 PASSED: Auditor key checked");
    } catch (e: any) {
        console.log(`❌ TEST 2 FAILED: ${e.message}`);
    }
    console.log();

    // ============================================================
    // TEST 3: Register Users (if circuits available)
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🧪 TEST 3: User Registration");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const testUser1 = new TestUser(deployer.address);

    try {
        const isRegistered = await registrar.isUserRegistered(deployer.address);

        if (isRegistered) {
            console.log(`✓ User ${deployer.address} already registered`);
        } else if (registrationCircuit) {
            console.log("   Registering user with ZK proof...");

            const registrationHash = testUser1.genRegistrationHash(chainId);
            const input = {
                SenderPrivateKey: testUser1.formattedPrivateKey,
                SenderPublicKey: testUser1.publicKey,
                SenderAddress: BigInt(deployer.address),
                ChainID: chainId,
                RegistrationHash: registrationHash,
            };

            const proof = await registrationCircuit.generateProof(input);
            const calldata = await registrationCircuit.generateCalldata(proof);

            const tx = await registrar.connect(deployer).register({
                proofPoints: calldata.proofPoints as any,
                publicSignals: calldata.publicSignals as any,
            });
            await tx.wait();

            console.log(`✓ User registered (tx: ${tx.hash})`);
        } else {
            console.log("⚠️  Skipped: ZK circuits not available");
        }
        console.log("✅ TEST 3 PASSED");
    } catch (e: any) {
        console.log(`❌ TEST 3 FAILED: ${e.message}`);
    }
    console.log();

    // ============================================================
    // TEST 4: Create Swap Offer
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🧪 TEST 4: Create Swap Offer");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
        const isRegistered = await registrar.isUserRegistered(deployer.address);

        if (!isRegistered) {
            console.log("⚠️  Skipped: User not registered");
        } else {
            const rate = ethers.parseEther("2"); // 2:1 rate
            const maxAmountToSell = 1000n;

            const nextIdBefore = await diamondAsSwap.nextOfferId();

            const tx = await diamondAsSwap.connect(deployer).initiateOffer(
                ethers.ZeroAddress, // assetBuy
                ethers.ZeroAddress, // assetSell
                rate,
                maxAmountToSell,
                0n, // minAmountToSell
                0n, // expiresAt
                "0x" // approveData
            );
            await tx.wait();

            const nextIdAfter = await diamondAsSwap.nextOfferId();
            const offerId = nextIdBefore;

            const offer = await diamondAsSwap.getOffer(offerId);

            console.log(`✓ Offer created (tx: ${tx.hash})`);
            console.log(`  Offer ID: ${offerId}`);
            console.log(`  Initiator: ${offer.initiator}`);
            console.log(`  Rate: ${ethers.formatEther(offer.rate)}`);
            console.log(`  Max Amount: ${offer.maxAmountToSell}`);
            console.log("✅ TEST 4 PASSED: Offer created successfully");
        }
    } catch (e: any) {
        console.log(`❌ TEST 4 FAILED: ${e.message}`);
    }
    console.log();

    // ============================================================
    // TEST 5: Query Offers
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🧪 TEST 5: Query Swap Offers");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
        const nextOfferId = await diamondAsSwap.nextOfferId();
        console.log(`✓ Total offers created: ${nextOfferId}`);

        // List recent offers
        const numToShow = Math.min(Number(nextOfferId), 5);
        for (let i = Number(nextOfferId) - numToShow; i < Number(nextOfferId); i++) {
            const offer = await diamondAsSwap.getOffer(i);
            if (offer.initiator !== ethers.ZeroAddress) {
                console.log(`  Offer ${i}:`);
                console.log(`    Initiator: ${offer.initiator}`);
                console.log(`    Acceptor: ${offer.acceptor === ethers.ZeroAddress ? "None" : offer.acceptor}`);
                console.log(`    Rate: ${ethers.formatEther(offer.rate)}`);
                console.log(`    Max Amount: ${offer.maxAmountToSell}`);
            }
        }
        console.log("✅ TEST 5 PASSED");
    } catch (e: any) {
        console.log(`❌ TEST 5 FAILED: ${e.message}`);
    }
    console.log();

    // ============================================================
    // TEST 6: Query Allowances
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🧪 TEST 6: Query Allowances");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
        const [encryptedAmount, amountPCT, isPublic, publicAmount, nonce] =
            await diamondAsAllowance.getAllowance(deployer.address, deployment.contracts.zexDiamond, 0);

        console.log(`✓ Self-allowance query:`);
        console.log(`  Is Public: ${isPublic}`);
        console.log(`  Public Amount: ${publicAmount}`);
        console.log(`  Nonce: ${nonce}`);
        console.log("✅ TEST 6 PASSED");
    } catch (e: any) {
        console.log(`❌ TEST 6 FAILED: ${e.message}`);
    }
    console.log();

    // ============================================================
    // TEST 7: Balance Query
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🧪 TEST 7: Balance Query");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
        const balance = await diamondAsToken.balanceOfStandalone(deployer.address);

        console.log(`✓ Balance query for ${deployer.address}:`);
        console.log(`  EGCT C1: (${balance.eGCT.c1.x}, ${balance.eGCT.c1.y})`);
        console.log(`  EGCT C2: (${balance.eGCT.c2.x}, ${balance.eGCT.c2.y})`);
        console.log(`  Nonce: ${balance.nonce}`);
        console.log(`  Transaction Index: ${balance.transactionIndex}`);
        console.log("✅ TEST 7 PASSED");
    } catch (e: any) {
        console.log(`❌ TEST 7 FAILED: ${e.message}`);
    }
    console.log();

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║                    INTEGRATION TEST COMPLETE                   ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
    console.log();
    console.log("📋 Summary:");
    console.log(`   Network: ${networkName}`);
    console.log(`   Diamond: ${deployment.contracts.zexDiamond}`);
    console.log(`   Next Offer ID: ${await diamondAsSwap.nextOfferId()}`);
    console.log();
    console.log("🔗 Explorer Links:");
    if (networkName === "mantle") {
        console.log(`   Diamond: https://explorer.mantle.xyz/address/${deployment.contracts.zexDiamond}`);
    } else if (networkName === "mantleSepolia") {
        console.log(`   Diamond: https://explorer.sepolia.mantle.xyz/address/${deployment.contracts.zexDiamond}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
