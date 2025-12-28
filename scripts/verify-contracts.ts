import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentAddresses {
    contracts: {
        [key: string]: string;
    };
}

async function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyContract(name: string, address: string, constructorArguments: any[] = []) {
    console.log(`\n📋 Verifying ${name} at ${address}...`);
    try {
        await run("verify:verify", {
            address,
            constructorArguments,
        });
        console.log(`✅ ${name} verified successfully!`);
        return true;
    } catch (error: any) {
        if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
            console.log(`✅ ${name} already verified`);
            return true;
        }
        console.log(`❌ ${name} verification failed: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║           ZEX Diamond Contract Verification                    ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");

    const networkName = network.name;
    const chainId = network.config.chainId;

    console.log(`\n📡 Network: ${networkName} (Chain ID: ${chainId})`);

    // Load deployment
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    const deploymentFile = path.join(deploymentsDir, `${networkName}-${chainId}.json`);

    if (!fs.existsSync(deploymentFile)) {
        console.error(`❌ Deployment file not found: ${deploymentFile}`);
        process.exit(1);
    }

    const deployment: DeploymentAddresses = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
    console.log(`📄 Loaded deployment from: ${deploymentFile}`);

    const results: { name: string; success: boolean }[] = [];

    // Verify contracts one by one with delays
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📚 Verifying Libraries");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    results.push({ name: "BabyJubJub", success: await verifyContract("BabyJubJub", deployment.contracts.babyJubJub) });
    await delay(3000);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔐 Verifying Base Verifiers");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    results.push({ name: "RegistrationVerifier", success: await verifyContract("RegistrationVerifier", deployment.contracts.registrationVerifier) });
    await delay(3000);
    results.push({ name: "MintVerifier", success: await verifyContract("MintVerifier", deployment.contracts.mintVerifier) });
    await delay(3000);
    results.push({ name: "WithdrawVerifier", success: await verifyContract("WithdrawVerifier", deployment.contracts.withdrawVerifier) });
    await delay(3000);
    results.push({ name: "TransferVerifier", success: await verifyContract("TransferVerifier", deployment.contracts.transferVerifier) });
    await delay(3000);
    results.push({ name: "BurnVerifier", success: await verifyContract("BurnVerifier", deployment.contracts.burnVerifier) });
    await delay(3000);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔐 Verifying ZEX Verifiers");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    results.push({ name: "ConfidentialApproveVerifier", success: await verifyContract("ConfidentialApproveVerifier", deployment.contracts.confidentialApproveVerifier) });
    await delay(3000);
    results.push({ name: "ConfidentialTransferFromVerifier", success: await verifyContract("ConfidentialTransferFromVerifier", deployment.contracts.confidentialTransferFromVerifier) });
    await delay(3000);
    results.push({ name: "CancelAllowanceVerifier", success: await verifyContract("CancelAllowanceVerifier", deployment.contracts.cancelAllowanceVerifier) });
    await delay(3000);
    results.push({ name: "OfferAcceptanceVerifier", success: await verifyContract("OfferAcceptanceVerifier", deployment.contracts.offerAcceptanceVerifier) });
    await delay(3000);
    results.push({ name: "OfferFinalizationVerifier", success: await verifyContract("OfferFinalizationVerifier", deployment.contracts.offerFinalizationVerifier) });
    await delay(3000);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📝 Verifying Registrar");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    results.push({ name: "Registrar", success: await verifyContract("Registrar", deployment.contracts.registrar, [deployment.contracts.registrationVerifier]) });
    await delay(3000);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💎 Verifying Diamond Facets");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    results.push({ name: "DiamondCutFacet", success: await verifyContract("DiamondCutFacet", deployment.contracts.diamondCutFacet) });
    await delay(3000);
    results.push({ name: "ZexTokenFacet", success: await verifyContract("ZexTokenFacet", deployment.contracts.zexTokenFacet) });
    await delay(3000);
    results.push({ name: "ZexAllowanceFacet", success: await verifyContract("ZexAllowanceFacet", deployment.contracts.zexAllowanceFacet) });
    await delay(3000);
    results.push({ name: "ZexSwapFacet", success: await verifyContract("ZexSwapFacet", deployment.contracts.zexSwapFacet) });
    await delay(3000);
    results.push({ name: "DiamondInit", success: await verifyContract("DiamondInit", deployment.contracts.diamondInit) });
    await delay(3000);

    // Summary
    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║                    VERIFICATION SUMMARY                        ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\n✅ Verified: ${successful.length}/${results.length}`);
    if (successful.length > 0) {
        successful.forEach(r => console.log(`   ✓ ${r.name}`));
    }

    if (failed.length > 0) {
        console.log(`\n❌ Failed: ${failed.length}/${results.length}`);
        failed.forEach(r => console.log(`   ✗ ${r.name}`));
    }

    console.log("\n📋 Contract Addresses:");
    console.log(`   Diamond: ${deployment.contracts.zexDiamond}`);
    console.log(`   Registrar: ${deployment.contracts.registrar}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
