import { ethers, run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Deployment addresses will be saved here
interface DeploymentAddresses {
    network: string;
    chainId: number;
    deployer: string;
    timestamp: string;
    contracts: {
        // Libraries
        babyJubJub: string;
        // Base Verifiers
        registrationVerifier: string;
        mintVerifier: string;
        withdrawVerifier: string;
        transferVerifier: string;
        burnVerifier: string;
        // ZEX Verifiers
        confidentialApproveVerifier: string;
        confidentialTransferFromVerifier: string;
        cancelAllowanceVerifier: string;
        offerAcceptanceVerifier: string;
        offerFinalizationVerifier: string;
        // Core
        registrar: string;
        // Diamond
        diamondCutFacet: string;
        zexTokenFacet: string;
        zexAllowanceFacet: string;
        zexSwapFacet: string;
        diamondInit: string;
        zexDiamond: string;
    };
}

async function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyContract(address: string, constructorArguments: any[] = []) {
    console.log(`  Verifying ${address}...`);
    try {
        await run("verify:verify", {
            address,
            constructorArguments,
        });
        console.log(`  ✓ Verified ${address}`);
    } catch (error: any) {
        if (error.message.includes("Already Verified")) {
            console.log(`  ✓ Already verified ${address}`);
        } else {
            console.log(`  ✗ Verification failed: ${error.message}`);
        }
    }
}

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║           ZEX Diamond Deployment to Mantle L2                  ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
    console.log();

    const [deployer] = await ethers.getSigners();
    const networkName = network.name;
    const chainId = (await ethers.provider.getNetwork()).chainId;

    console.log(`📡 Network: ${networkName} (Chain ID: ${chainId})`);
    console.log(`👤 Deployer: ${deployer.address}`);
    console.log(`💰 Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} MNT`);
    console.log();

    if (networkName === "hardhat" || networkName === "localhost") {
        console.log("⚠️  Running on local network - verification will be skipped");
    }

    const deployment: DeploymentAddresses = {
        network: networkName,
        chainId: Number(chainId),
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {} as DeploymentAddresses["contracts"],
    };

    // ============================================================
    // PHASE 1: Deploy Libraries
    // ============================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📚 PHASE 1: Deploying Libraries");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const BabyJubJub = await ethers.getContractFactory("BabyJubJub");
    const babyJubJub = await BabyJubJub.deploy();
    await babyJubJub.waitForDeployment();
    deployment.contracts.babyJubJub = await babyJubJub.getAddress();
    console.log(`✓ BabyJubJub: ${deployment.contracts.babyJubJub}`);

    // ============================================================
    // PHASE 2: Deploy Base Verifiers
    // ============================================================
    console.log();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔐 PHASE 2: Deploying Base Verifiers");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const RegistrationVerifier = await ethers.getContractFactory("RegistrationCircuitGroth16Verifier");
    const registrationVerifier = await RegistrationVerifier.deploy();
    await registrationVerifier.waitForDeployment();
    deployment.contracts.registrationVerifier = await registrationVerifier.getAddress();
    console.log(`✓ RegistrationVerifier: ${deployment.contracts.registrationVerifier}`);

    const MintVerifier = await ethers.getContractFactory("MintCircuitGroth16Verifier");
    const mintVerifier = await MintVerifier.deploy();
    await mintVerifier.waitForDeployment();
    deployment.contracts.mintVerifier = await mintVerifier.getAddress();
    console.log(`✓ MintVerifier: ${deployment.contracts.mintVerifier}`);

    const WithdrawVerifier = await ethers.getContractFactory("WithdrawCircuitGroth16Verifier");
    const withdrawVerifier = await WithdrawVerifier.deploy();
    await withdrawVerifier.waitForDeployment();
    deployment.contracts.withdrawVerifier = await withdrawVerifier.getAddress();
    console.log(`✓ WithdrawVerifier: ${deployment.contracts.withdrawVerifier}`);

    const TransferVerifier = await ethers.getContractFactory("TransferCircuitGroth16Verifier");
    const transferVerifier = await TransferVerifier.deploy();
    await transferVerifier.waitForDeployment();
    deployment.contracts.transferVerifier = await transferVerifier.getAddress();
    console.log(`✓ TransferVerifier: ${deployment.contracts.transferVerifier}`);

    const BurnVerifier = await ethers.getContractFactory("BurnCircuitGroth16Verifier");
    const burnVerifier = await BurnVerifier.deploy();
    await burnVerifier.waitForDeployment();
    deployment.contracts.burnVerifier = await burnVerifier.getAddress();
    console.log(`✓ BurnVerifier: ${deployment.contracts.burnVerifier}`);

    // ============================================================
    // PHASE 3: Deploy ZEX Verifiers
    // ============================================================
    console.log();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔐 PHASE 3: Deploying ZEX Verifiers");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const ConfidentialApproveVerifier = await ethers.getContractFactory("ConfidentialApproveCircuitGroth16Verifier");
    const confidentialApproveVerifier = await ConfidentialApproveVerifier.deploy();
    await confidentialApproveVerifier.waitForDeployment();
    deployment.contracts.confidentialApproveVerifier = await confidentialApproveVerifier.getAddress();
    console.log(`✓ ConfidentialApproveVerifier: ${deployment.contracts.confidentialApproveVerifier}`);

    const ConfidentialTransferFromVerifier = await ethers.getContractFactory("ConfidentialTransferFromCircuitGroth16Verifier");
    const confidentialTransferFromVerifier = await ConfidentialTransferFromVerifier.deploy();
    await confidentialTransferFromVerifier.waitForDeployment();
    deployment.contracts.confidentialTransferFromVerifier = await confidentialTransferFromVerifier.getAddress();
    console.log(`✓ ConfidentialTransferFromVerifier: ${deployment.contracts.confidentialTransferFromVerifier}`);

    const CancelAllowanceVerifier = await ethers.getContractFactory("CancelAllowanceCircuitGroth16Verifier");
    const cancelAllowanceVerifier = await CancelAllowanceVerifier.deploy();
    await cancelAllowanceVerifier.waitForDeployment();
    deployment.contracts.cancelAllowanceVerifier = await cancelAllowanceVerifier.getAddress();
    console.log(`✓ CancelAllowanceVerifier: ${deployment.contracts.cancelAllowanceVerifier}`);

    const OfferAcceptanceVerifier = await ethers.getContractFactory("OfferAcceptanceCircuitGroth16Verifier");
    const offerAcceptanceVerifier = await OfferAcceptanceVerifier.deploy();
    await offerAcceptanceVerifier.waitForDeployment();
    deployment.contracts.offerAcceptanceVerifier = await offerAcceptanceVerifier.getAddress();
    console.log(`✓ OfferAcceptanceVerifier: ${deployment.contracts.offerAcceptanceVerifier}`);

    const OfferFinalizationVerifier = await ethers.getContractFactory("OfferFinalizationCircuitGroth16Verifier");
    const offerFinalizationVerifier = await OfferFinalizationVerifier.deploy();
    await offerFinalizationVerifier.waitForDeployment();
    deployment.contracts.offerFinalizationVerifier = await offerFinalizationVerifier.getAddress();
    console.log(`✓ OfferFinalizationVerifier: ${deployment.contracts.offerFinalizationVerifier}`);

    // ============================================================
    // PHASE 4: Deploy Registrar
    // ============================================================
    console.log();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📝 PHASE 4: Deploying Registrar");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const Registrar = await ethers.getContractFactory("Registrar");
    const registrar = await Registrar.deploy(deployment.contracts.registrationVerifier);
    await registrar.waitForDeployment();
    deployment.contracts.registrar = await registrar.getAddress();
    console.log(`✓ Registrar: ${deployment.contracts.registrar}`);

    // ============================================================
    // PHASE 5: Deploy Diamond Facets
    // ============================================================
    console.log();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💎 PHASE 5: Deploying Diamond Facets");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const libraryAddresses = {
        "contracts/libraries/BabyJubJub.sol:BabyJubJub": deployment.contracts.babyJubJub,
    };

    const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
    const diamondCutFacet = await DiamondCutFacet.deploy();
    await diamondCutFacet.waitForDeployment();
    deployment.contracts.diamondCutFacet = await diamondCutFacet.getAddress();
    console.log(`✓ DiamondCutFacet: ${deployment.contracts.diamondCutFacet}`);

    const ZexTokenFacet = await ethers.getContractFactory("ZexTokenFacet", { libraries: libraryAddresses });
    const zexTokenFacet = await ZexTokenFacet.deploy();
    await zexTokenFacet.waitForDeployment();
    deployment.contracts.zexTokenFacet = await zexTokenFacet.getAddress();
    console.log(`✓ ZexTokenFacet: ${deployment.contracts.zexTokenFacet}`);

    const ZexAllowanceFacet = await ethers.getContractFactory("ZexAllowanceFacet", { libraries: libraryAddresses });
    const zexAllowanceFacet = await ZexAllowanceFacet.deploy();
    await zexAllowanceFacet.waitForDeployment();
    deployment.contracts.zexAllowanceFacet = await zexAllowanceFacet.getAddress();
    console.log(`✓ ZexAllowanceFacet: ${deployment.contracts.zexAllowanceFacet}`);

    const ZexSwapFacet = await ethers.getContractFactory("ZexSwapFacet");
    const zexSwapFacet = await ZexSwapFacet.deploy();
    await zexSwapFacet.waitForDeployment();
    deployment.contracts.zexSwapFacet = await zexSwapFacet.getAddress();
    console.log(`✓ ZexSwapFacet: ${deployment.contracts.zexSwapFacet}`);

    const DiamondInit = await ethers.getContractFactory("DiamondInit");
    const diamondInit = await DiamondInit.deploy();
    await diamondInit.waitForDeployment();
    deployment.contracts.diamondInit = await diamondInit.getAddress();
    console.log(`✓ DiamondInit: ${deployment.contracts.diamondInit}`);

    // ============================================================
    // PHASE 6: Deploy Diamond Proxy
    // ============================================================
    console.log();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💎 PHASE 6: Deploying Diamond Proxy");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Get function selectors
    const diamondCutSelectors = [diamondCutFacet.interface.getFunction("diamondCut")!.selector];

    const tokenSelectors = [
        zexTokenFacet.interface.getFunction("setAuditorPublicKey")!.selector,
        zexTokenFacet.interface.getFunction("mint")!.selector,
        zexTokenFacet.interface.getFunction("transfer")!.selector,
        zexTokenFacet.interface.getFunction("burn")!.selector,
        zexTokenFacet.interface.getFunction("balanceOf")!.selector,
        zexTokenFacet.interface.getFunction("balanceOfStandalone")!.selector,
        zexTokenFacet.interface.getFunction("name")!.selector,
        zexTokenFacet.interface.getFunction("symbol")!.selector,
        zexTokenFacet.interface.getFunction("decimals")!.selector,
        zexTokenFacet.interface.getFunction("registrar")!.selector,
        zexTokenFacet.interface.getFunction("auditorPublicKey")!.selector,
    ];

    const allowanceSelectors = [
        zexAllowanceFacet.interface.getFunction("confidentialApprove")!.selector,
        zexAllowanceFacet.interface.getFunction("publicConfidentialApprove")!.selector,
        zexAllowanceFacet.interface.getFunction("confidentialTransferFrom")!.selector,
        zexAllowanceFacet.interface.getFunction("publicConfidentialTransferFrom")!.selector,
        zexAllowanceFacet.interface.getFunction("cancelConfidentialAllowance")!.selector,
        zexAllowanceFacet.interface.getFunction("cancelPublicConfidentialAllowance")!.selector,
        zexAllowanceFacet.interface.getFunction("getAllowance")!.selector,
    ];

    const swapSelectors = [
        zexSwapFacet.interface.getFunction("initiateOffer")!.selector,
        zexSwapFacet.interface.getFunction("acceptOffer")!.selector,
        zexSwapFacet.interface.getFunction("finalizeSwap")!.selector,
        zexSwapFacet.interface.getFunction("getOffer")!.selector,
        zexSwapFacet.interface.getFunction("nextOfferId")!.selector,
    ];

    const diamondCut = [
        { facetAddress: deployment.contracts.diamondCutFacet, action: 0, functionSelectors: diamondCutSelectors },
        { facetAddress: deployment.contracts.zexTokenFacet, action: 0, functionSelectors: tokenSelectors },
        { facetAddress: deployment.contracts.zexAllowanceFacet, action: 0, functionSelectors: allowanceSelectors },
        { facetAddress: deployment.contracts.zexSwapFacet, action: 0, functionSelectors: swapSelectors },
    ];

    // Prepare init params
    const initParams = {
        name: "ZEX Confidential Token",
        symbol: "ZEX",
        decimals: 18,
        registrar: deployment.contracts.registrar,
        mintVerifier: deployment.contracts.mintVerifier,
        withdrawVerifier: deployment.contracts.withdrawVerifier,
        transferVerifier: deployment.contracts.transferVerifier,
        burnVerifier: deployment.contracts.burnVerifier,
        confidentialApproveVerifier: deployment.contracts.confidentialApproveVerifier,
        confidentialTransferFromVerifier: deployment.contracts.confidentialTransferFromVerifier,
        cancelAllowanceVerifier: deployment.contracts.cancelAllowanceVerifier,
        offerAcceptanceVerifier: deployment.contracts.offerAcceptanceVerifier,
        offerFinalizationVerifier: deployment.contracts.offerFinalizationVerifier,
    };

    const initData = diamondInit.interface.encodeFunctionData("init", [initParams]);

    const ZexDiamond = await ethers.getContractFactory("ZexDiamond");
    const zexDiamond = await ZexDiamond.deploy(
        deployer.address,
        diamondCut,
        deployment.contracts.diamondInit,
        initData
    );
    await zexDiamond.waitForDeployment();
    deployment.contracts.zexDiamond = await zexDiamond.getAddress();
    console.log(`✓ ZexDiamond: ${deployment.contracts.zexDiamond}`);

    // ============================================================
    // PHASE 7: Save Deployment
    // ============================================================
    console.log();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💾 PHASE 7: Saving Deployment");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const deploymentFile = path.join(deploymentsDir, `${networkName}-${chainId}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
    console.log(`✓ Deployment saved to: ${deploymentFile}`);

    // ============================================================
    // PHASE 8: Verify Contracts
    // ============================================================
    if (networkName !== "hardhat" && networkName !== "localhost") {
        console.log();
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("✅ PHASE 8: Verifying Contracts");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("⏳ Waiting 30s for block explorer to index contracts...");
        await delay(30000);

        console.log("Verifying libraries...");
        await verifyContract(deployment.contracts.babyJubJub);

        console.log("Verifying base verifiers...");
        await verifyContract(deployment.contracts.registrationVerifier);
        await verifyContract(deployment.contracts.mintVerifier);
        await verifyContract(deployment.contracts.withdrawVerifier);
        await verifyContract(deployment.contracts.transferVerifier);
        await verifyContract(deployment.contracts.burnVerifier);

        console.log("Verifying ZEX verifiers...");
        await verifyContract(deployment.contracts.confidentialApproveVerifier);
        await verifyContract(deployment.contracts.confidentialTransferFromVerifier);
        await verifyContract(deployment.contracts.cancelAllowanceVerifier);
        await verifyContract(deployment.contracts.offerAcceptanceVerifier);
        await verifyContract(deployment.contracts.offerFinalizationVerifier);

        console.log("Verifying Registrar...");
        await verifyContract(deployment.contracts.registrar, [deployment.contracts.registrationVerifier]);

        console.log("Verifying Diamond facets...");
        await verifyContract(deployment.contracts.diamondCutFacet);
        await verifyContract(deployment.contracts.zexTokenFacet);
        await verifyContract(deployment.contracts.zexAllowanceFacet);
        await verifyContract(deployment.contracts.zexSwapFacet);
        await verifyContract(deployment.contracts.diamondInit);

        console.log("Verifying Diamond proxy...");
        await verifyContract(deployment.contracts.zexDiamond, [
            deployer.address,
            diamondCut,
            deployment.contracts.diamondInit,
            initData,
        ]);
    }

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log();
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║                    DEPLOYMENT COMPLETE! 🎉                     ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
    console.log();
    console.log("📋 Contract Addresses:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`💎 ZEX Diamond (Main): ${deployment.contracts.zexDiamond}`);
    console.log(`📝 Registrar:          ${deployment.contracts.registrar}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log();
    console.log("🔗 Explorer Links:");
    if (networkName === "mantle") {
        console.log(`   Diamond: https://explorer.mantle.xyz/address/${deployment.contracts.zexDiamond}`);
    } else if (networkName === "mantleSepolia") {
        console.log(`   Diamond: https://explorer.sepolia.mantle.xyz/address/${deployment.contracts.zexDiamond}`);
    }
    console.log();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
