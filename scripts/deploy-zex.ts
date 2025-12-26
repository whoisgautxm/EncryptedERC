import { ethers } from "hardhat";
import { deployVerifiers, deployLibrary } from "../test/helpers";
import {
    ZexERC__factory,
    ConfidentialApproveCircuitGroth16Verifier__factory,
    ConfidentialTransferFromCircuitGroth16Verifier__factory,
    CancelAllowanceCircuitGroth16Verifier__factory,
    Registrar__factory,
} from "../typechain-types";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying ZexERC with account:", deployer.address);

    // Deploy base verifiers (from EncryptedERC)
    console.log("\n1. Deploying base verifiers...");
    const baseVerifiers = await deployVerifiers(deployer, false);
    console.log("Base verifiers deployed");

    // Deploy BabyJubJub library
    console.log("\n2. Deploying BabyJubJub library...");
    const babyJubJubAddress = await deployLibrary(deployer);
    console.log("BabyJubJub deployed at:", babyJubJubAddress);

    // Deploy ZEX-specific verifiers
    console.log("\n3. Deploying ZEX verifiers...");

    const confidentialApproveVerifierFactory = new ConfidentialApproveCircuitGroth16Verifier__factory(deployer);
    const confidentialApproveVerifier = await confidentialApproveVerifierFactory.deploy();
    await confidentialApproveVerifier.waitForDeployment();
    console.log("ConfidentialApproveVerifier deployed at:", await confidentialApproveVerifier.getAddress());

    const confidentialTransferFromVerifierFactory = new ConfidentialTransferFromCircuitGroth16Verifier__factory(deployer);
    const confidentialTransferFromVerifier = await confidentialTransferFromVerifierFactory.deploy();
    await confidentialTransferFromVerifier.waitForDeployment();
    console.log("ConfidentialTransferFromVerifier deployed at:", await confidentialTransferFromVerifier.getAddress());

    const cancelAllowanceVerifierFactory = new CancelAllowanceCircuitGroth16Verifier__factory(deployer);
    const cancelAllowanceVerifier = await cancelAllowanceVerifierFactory.deploy();
    await cancelAllowanceVerifier.waitForDeployment();
    console.log("CancelAllowanceVerifier deployed at:", await cancelAllowanceVerifier.getAddress());

    // Deploy Registrar
    console.log("\n4. Deploying Registrar...");
    const registrarFactory = new Registrar__factory(deployer);
    const registrar = await registrarFactory.deploy(baseVerifiers.registrationVerifier);
    await registrar.waitForDeployment();
    console.log("Registrar deployed at:", await registrar.getAddress());

    // Deploy ZexERC
    console.log("\n5. Deploying ZexERC...");
    const zexERCFactory = new ZexERC__factory({
        "contracts/libraries/BabyJubJub.sol:BabyJubJub": babyJubJubAddress,
    }, deployer);

    const zexERC = await zexERCFactory.deploy({
        baseParams: {
            registrar: await registrar.getAddress(),
            isConverter: false,
            name: "ZEX Token",
            symbol: "ZEX",
            decimals: 18,
            mintVerifier: baseVerifiers.mintVerifier,
            withdrawVerifier: baseVerifiers.withdrawVerifier,
            transferVerifier: baseVerifiers.transferVerifier,
            burnVerifier: baseVerifiers.burnVerifier,
        },
        confidentialApproveVerifier: await confidentialApproveVerifier.getAddress(),
        confidentialTransferFromVerifier: await confidentialTransferFromVerifier.getAddress(),
        cancelAllowanceVerifier: await cancelAllowanceVerifier.getAddress(),
    });

    await zexERC.waitForDeployment();
    console.log("ZexERC deployed at:", await zexERC.getAddress());

    console.log("\n========================================");
    console.log("Deployment complete!");
    console.log("========================================");
    console.log({
        registrar: await registrar.getAddress(),
        zexERC: await zexERC.getAddress(),
        confidentialApproveVerifier: await confidentialApproveVerifier.getAddress(),
        confidentialTransferFromVerifier: await confidentialTransferFromVerifier.getAddress(),
        cancelAllowanceVerifier: await cancelAllowanceVerifier.getAddress(),
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
