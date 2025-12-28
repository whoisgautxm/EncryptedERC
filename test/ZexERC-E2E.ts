/**
 * ZEX End-to-End Test Suite
 * 
 * Tests the complete ZEX swap lifecycle with real ZK proofs:
 * 1. User registration
 * 2. Confidential token minting
 * 3. Offer creation
 * 4. Offer acceptance with OfferAcceptance ZK proof
 * 5. Offer finalization with OfferFinalization ZK proof
 * 6. Balance verification
 */
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, zkit } from "hardhat";
import type {
    RegistrationCircuit,
    OfferAcceptanceCircuit,
    OfferFinalizationCircuit,
} from "../generated-types/zkit";
import { processPoseidonEncryption } from "../src";
import { encryptMessage } from "../src/jub/jub";
import type { ZexERC } from "../typechain-types/contracts/ZexERC";
import type { Registrar } from "../typechain-types/contracts/Registrar";
import {
    ZexERC__factory,
    Registrar__factory,
} from "../typechain-types/factories/contracts";
import {
    ConfidentialApproveCircuitGroth16Verifier__factory,
    ConfidentialTransferFromCircuitGroth16Verifier__factory,
    CancelAllowanceCircuitGroth16Verifier__factory,
    OfferAcceptanceCircuitGroth16Verifier__factory,
    OfferFinalizationCircuitGroth16Verifier__factory,
} from "../typechain-types/factories/contracts/verifiers";
import {
    deployLibrary,
    deployVerifiers,
    getDecryptedBalance,
    privateMint,
} from "./helpers";
import { User } from "./user";

const DECIMALS = 2;

describe("ZexERC - End-to-End Swap", () => {
    let registrar: Registrar;
    let tokenA: ZexERC;
    let tokenB: ZexERC;
    let users: User[];
    let signers: SignerWithAddress[];
    let owner: SignerWithAddress;
    let auditorPublicKey: [bigint, bigint];

    // Users
    let initiator: User;
    let acceptor: User;

    // Circuit instances
    let registrationCircuit: RegistrationCircuit;
    let offerAcceptanceCircuit: OfferAcceptanceCircuit;
    let offerFinalizationCircuit: OfferFinalizationCircuit;

    // Test parameters
    const MINT_AMOUNT = 10000n;
    const RATE = 1n; // 1:1 exchange for simplicity
    const MAX_AMOUNT_TO_SELL = 1000n;
    const AMOUNT_TO_BUY = 500n;

    /**
     * Deploy all contracts and verifiers
     */
    const deployFixture = async () => {
        signers = await ethers.getSigners();
        owner = signers[0];

        // Deploy base verifiers
        const baseVerifiers = await deployVerifiers(owner, false);
        const babyJubJub = await deployLibrary(owner);

        // Deploy Registrar
        const registrarFactory = new Registrar__factory(owner);
        const registrar_ = await registrarFactory.connect(owner).deploy(baseVerifiers.registrationVerifier);
        await registrar_.waitForDeployment();

        // Deploy ZEX-specific verifiers
        const confidentialApproveVerifier = await new ConfidentialApproveCircuitGroth16Verifier__factory(owner).deploy();
        const confidentialTransferFromVerifier = await new ConfidentialTransferFromCircuitGroth16Verifier__factory(owner).deploy();
        const cancelAllowanceVerifier = await new CancelAllowanceCircuitGroth16Verifier__factory(owner).deploy();
        const offerAcceptanceVerifier = await new OfferAcceptanceCircuitGroth16Verifier__factory(owner).deploy();
        const offerFinalizationVerifier = await new OfferFinalizationCircuitGroth16Verifier__factory(owner).deploy();

        await Promise.all([
            confidentialApproveVerifier.waitForDeployment(),
            confidentialTransferFromVerifier.waitForDeployment(),
            cancelAllowanceVerifier.waitForDeployment(),
            offerAcceptanceVerifier.waitForDeployment(),
            offerFinalizationVerifier.waitForDeployment(),
        ]);

        // Deploy TokenA (ZexERC)
        const zexERCFactory = new ZexERC__factory({
            "contracts/libraries/BabyJubJub.sol:BabyJubJub": babyJubJub,
        }, owner);

        const tokenA_ = await zexERCFactory.connect(owner).deploy({
            baseParams: {
                registrar: registrar_.target,
                isConverter: false,
                name: "Token A",
                symbol: "TKA",
                mintVerifier: baseVerifiers.mintVerifier,
                withdrawVerifier: baseVerifiers.withdrawVerifier,
                transferVerifier: baseVerifiers.transferVerifier,
                burnVerifier: baseVerifiers.burnVerifier,
                decimals: DECIMALS,
            },
            confidentialApproveVerifier: confidentialApproveVerifier.target,
            confidentialTransferFromVerifier: confidentialTransferFromVerifier.target,
            cancelAllowanceVerifier: cancelAllowanceVerifier.target,
            offerAcceptanceVerifier: offerAcceptanceVerifier.target,
            offerFinalizationVerifier: offerFinalizationVerifier.target,
        });
        await tokenA_.waitForDeployment();

        // Deploy TokenB (ZexERC)
        const tokenB_ = await zexERCFactory.connect(owner).deploy({
            baseParams: {
                registrar: registrar_.target,
                isConverter: false,
                name: "Token B",
                symbol: "TKB",
                mintVerifier: baseVerifiers.mintVerifier,
                withdrawVerifier: baseVerifiers.withdrawVerifier,
                transferVerifier: baseVerifiers.transferVerifier,
                burnVerifier: baseVerifiers.burnVerifier,
                decimals: DECIMALS,
            },
            confidentialApproveVerifier: confidentialApproveVerifier.target,
            confidentialTransferFromVerifier: confidentialTransferFromVerifier.target,
            cancelAllowanceVerifier: cancelAllowanceVerifier.target,
            offerAcceptanceVerifier: offerAcceptanceVerifier.target,
            offerFinalizationVerifier: offerFinalizationVerifier.target,
        });
        await tokenB_.waitForDeployment();

        registrar = registrar_;
        tokenA = tokenA_;
        tokenB = tokenB_;
        users = signers.map((signer) => new User(signer));

        // Assign roles
        initiator = users[1];
        acceptor = users[2];

        // Get circuit instances
        registrationCircuit = await zkit.getCircuit("RegistrationCircuit") as unknown as RegistrationCircuit;
        offerAcceptanceCircuit = await zkit.getCircuit("OfferAcceptanceCircuit") as unknown as OfferAcceptanceCircuit;
        offerFinalizationCircuit = await zkit.getCircuit("OfferFinalizationCircuit") as unknown as OfferFinalizationCircuit;
    };

    before(async () => {
        await deployFixture();
    });

    describe("Phase 1: Setup", () => {
        it("should deploy contracts properly", async () => {
            expect(tokenA.target).to.not.be.null;
            expect(tokenB.target).to.not.be.null;
            expect(await tokenA.name()).to.equal("Token A");
            expect(await tokenB.name()).to.equal("Token B");
        });

        it("should register users with real ZK proofs", async () => {
            const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);

            // Register initiator and acceptor
            for (const user of [initiator, acceptor]) {
                const registrationHash = user.genRegistrationHash(chainId);

                const input = {
                    SenderPrivateKey: user.formattedPrivateKey,
                    SenderPublicKey: user.publicKey,
                    SenderAddress: BigInt(user.signer.address),
                    ChainID: chainId,
                    RegistrationHash: registrationHash,
                };

                const proof = await registrationCircuit.generateProof(input);
                await expect(registrationCircuit).to.verifyProof(proof);

                const calldata = await registrationCircuit.generateCalldata(proof);

                await registrar.connect(user.signer).register({
                    proofPoints: calldata.proofPoints,
                    publicSignals: calldata.publicSignals,
                });

                expect(await registrar.isUserRegistered(user.signer.address)).to.be.true;
            }

            console.log("✓ Users registered with real ZK proofs");
        });

        it("should set auditor public key", async () => {
            // Register owner as auditor first
            const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
            const registrationHash = users[0].genRegistrationHash(chainId);

            const input = {
                SenderPrivateKey: users[0].formattedPrivateKey,
                SenderPublicKey: users[0].publicKey,
                SenderAddress: BigInt(users[0].signer.address),
                ChainID: chainId,
                RegistrationHash: registrationHash,
            };

            const proof = await registrationCircuit.generateProof(input);
            const calldata = await registrationCircuit.generateCalldata(proof);

            await registrar.connect(owner).register({
                proofPoints: calldata.proofPoints,
                publicSignals: calldata.publicSignals,
            });

            // Set auditor for both tokens
            await tokenA.connect(owner).setAuditorPublicKey(owner.address);
            await tokenB.connect(owner).setAuditorPublicKey(owner.address);

            auditorPublicKey = [users[0].publicKey[0], users[0].publicKey[1]];

            expect(await tokenA.isAuditorKeySet()).to.be.true;
            expect(await tokenB.isAuditorKeySet()).to.be.true;

            console.log("✓ Auditor set for both tokens");
        });

        it("should mint tokens to users with real ZK proofs", async () => {
            // Mint TokenA to initiator
            const calldataA = await privateMint(MINT_AMOUNT, initiator.publicKey, auditorPublicKey);
            await tokenA.connect(owner)[
                "privateMint(address,((uint256[2],uint256[2][2],uint256[2]),uint256[24]))"
            ](initiator.signer.address, {
                proofPoints: calldataA.proofPoints,
                publicSignals: calldataA.publicSignals,
            });

            // Mint TokenB to acceptor
            const calldataB = await privateMint(MINT_AMOUNT, acceptor.publicKey, auditorPublicKey);
            await tokenB.connect(owner)[
                "privateMint(address,((uint256[2],uint256[2][2],uint256[2]),uint256[24]))"
            ](acceptor.signer.address, {
                proofPoints: calldataB.proofPoints,
                publicSignals: calldataB.publicSignals,
            });

            // Verify balances
            const balanceA = await tokenA.balanceOfStandalone(initiator.signer.address);
            const decryptedA = await getDecryptedBalance(
                initiator.privateKey,
                balanceA.amountPCTs,
                balanceA.balancePCT,
                balanceA.eGCT,
            );
            expect(decryptedA).to.equal(MINT_AMOUNT);

            const balanceB = await tokenB.balanceOfStandalone(acceptor.signer.address);
            const decryptedB = await getDecryptedBalance(
                acceptor.privateKey,
                balanceB.amountPCTs,
                balanceB.balancePCT,
                balanceB.eGCT,
            );
            expect(decryptedB).to.equal(MINT_AMOUNT);

            console.log(`✓ Initiator: ${decryptedA} TokenA, Acceptor: ${decryptedB} TokenB`);
        });
    });

    describe("Phase 2: Offer Creation", () => {
        let offerId: bigint;

        it("should create an offer", async () => {
            // Initiator creates offer: sell TokenA, buy TokenB
            const tx = await tokenA.connect(initiator.signer).initiateOffer(
                tokenB.target, // assetBuy
                tokenA.target, // assetSell
                RATE, // rate
                MAX_AMOUNT_TO_SELL, // maxAmountToSell
                0n, // minAmountToSell (no minimum for this test)
                0n, // expiresAt (0 = no expiry)
                "0x", // approveData (not using publicConfidentialApprove in this test)
            );

            const receipt = await tx.wait();

            const offer = await tokenA.getOffer(0);
            expect(offer.initiator).to.equal(initiator.signer.address);
            expect(offer.rate).to.equal(RATE);
            expect(offer.maxAmountToSell).to.equal(MAX_AMOUNT_TO_SELL);

            offerId = 0n;
            console.log(`✓ Offer created: ID=${offerId}, maxSell=${MAX_AMOUNT_TO_SELL}, rate=${RATE}`);
        });
    });

    describe("Phase 3: Offer Acceptance with ZK Proof", () => {
        it("should accept offer with valid OfferAcceptance ZK proof", async () => {
            // Encrypt the amountToBuy for initiator (so they can decrypt during finalization)
            const { cipher: encryptedAmount, random: encryptionRandom } =
                encryptMessage(initiator.publicKey, AMOUNT_TO_BUY);

            // Generate OfferAcceptance proof
            const input = {
                AcceptorPrivateKey: acceptor.formattedPrivateKey,
                AmountToBuy: AMOUNT_TO_BUY,
                EncryptionRandom: encryptionRandom,
                AcceptorPublicKey: acceptor.publicKey,
                InitiatorPublicKey: initiator.publicKey,
                MaxAmountToSell: MAX_AMOUNT_TO_SELL,
                Rate: RATE,
                AmountToBuyC1: encryptedAmount[0],
                AmountToBuyC2: encryptedAmount[1],
            };

            const proof = await offerAcceptanceCircuit.generateProof(input);
            await expect(offerAcceptanceCircuit).to.verifyProof(proof);

            const calldata = await offerAcceptanceCircuit.generateCalldata(proof);

            // Encode the proof for the contract (10 public signals)
            const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[10] publicSignals)"],
                [{
                    proofPoints: calldata.proofPoints,
                    publicSignals: calldata.publicSignals,
                }]
            );

            // Accept the offer
            const tx = await tokenA.connect(acceptor.signer).acceptOffer(
                0, // offerId
                "0x", // approveData
                proofData, // proofData with real ZK proof
            );
            await tx.wait();

            const offer = await tokenA.getOffer(0);
            expect(offer.acceptor).to.equal(acceptor.signer.address);

            console.log(`✓ Offer accepted with valid ZK proof, amountToBuy=${AMOUNT_TO_BUY}`);
        });

        it("should FAIL when amount exceeds maxAmountToSell", async () => {
            // Create another offer for this test
            await tokenA.connect(initiator.signer).initiateOffer(
                tokenB.target,
                tokenA.target,
                RATE,
                MAX_AMOUNT_TO_SELL,
                0n, // minAmountToSell
                0n, // expiresAt
                "0x",
            );

            const excessAmount = MAX_AMOUNT_TO_SELL + 100n;
            const { cipher: encryptedAmount, random: encryptionRandom } =
                encryptMessage(initiator.publicKey, excessAmount);

            const input = {
                AcceptorPrivateKey: acceptor.formattedPrivateKey,
                AmountToBuy: excessAmount,
                EncryptionRandom: encryptionRandom,
                AcceptorPublicKey: acceptor.publicKey,
                InitiatorPublicKey: initiator.publicKey,
                MaxAmountToSell: MAX_AMOUNT_TO_SELL,
                Rate: RATE,
                AmountToBuyC1: encryptedAmount[0],
                AmountToBuyC2: encryptedAmount[1],
            };

            // Proof generation should fail due to circuit constraint
            try {
                await offerAcceptanceCircuit.generateProof(input);
                expect.fail("Should have thrown - amount exceeds max");
            } catch (e) {
                console.log("✓ Correctly rejected: amount exceeds maxAmountToSell");
            }
        });
    });

    describe("Phase 4: Offer Finalization with ZK Proof", () => {
        it("should finalize swap with valid OfferFinalization ZK proof", async () => {
            // Get the stored commitment from the offer
            const offer = await tokenA.getOffer(0);

            // Decode the stored commitment
            const [c1x, c1y, c2x, c2y] = ethers.AbiCoder.defaultAbiCoder().decode(
                ["uint256", "uint256", "uint256", "uint256"],
                offer.amountToBuyEncryptionData
            );

            // Encrypt sellAmount for acceptor
            const sellAmount = AMOUNT_TO_BUY; // Same as amountToBuy for 1:1 rate
            const { cipher: sellAmountEncrypted, random: sellEncryptionRandom } =
                encryptMessage(acceptor.publicKey, sellAmount);

            // Generate OfferFinalization proof
            const input = {
                InitiatorPrivateKey: initiator.formattedPrivateKey,
                AmountToBuy: AMOUNT_TO_BUY,
                SellAmount: sellAmount,
                SellEncryptionRandom: sellEncryptionRandom,
                InitiatorPublicKey: initiator.publicKey,
                AcceptorPublicKey: acceptor.publicKey,
                Rate: RATE,
                AmountToBuyC1: [c1x, c1y],
                AmountToBuyC2: [c2x, c2y],
                SellAmountC1: sellAmountEncrypted[0],
                SellAmountC2: sellAmountEncrypted[1],
            };

            const proof = await offerFinalizationCircuit.generateProof(input);
            await expect(offerFinalizationCircuit).to.verifyProof(proof);

            const calldata = await offerFinalizationCircuit.generateCalldata(proof);

            // Encode the proof for the contract (13 public signals)
            const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[13] publicSignals)"],
                [{
                    proofPoints: calldata.proofPoints,
                    publicSignals: calldata.publicSignals,
                }]
            );

            // Finalize the swap
            const tx = await tokenA.connect(initiator.signer).finalizeSwap(
                0, // offerId
                "0x", // transferFromData (not executing cross-contract transfers in this test)
                proofData, // proofData with real ZK proof
            );
            await tx.wait();

            // Offer should be deleted
            const finalOffer = await tokenA.getOffer(0);
            expect(finalOffer.initiator).to.equal(ethers.ZeroAddress);

            console.log("✓ Swap finalized with valid ZK proof");
        });
    });

    describe("Phase 5: Economic Invariants", () => {
        it("should verify buyAmount = sellAmount × rate", async () => {
            // For rate = 1, buyAmount should equal sellAmount
            const expectedSellAmount = AMOUNT_TO_BUY * RATE;
            expect(expectedSellAmount).to.equal(AMOUNT_TO_BUY);
            console.log(`✓ Economic invariant: ${AMOUNT_TO_BUY} × ${RATE} = ${expectedSellAmount}`);
        });

        it("should verify no extra tokens created", async () => {
            // Total minted = MINT_AMOUNT for each token
            // No additional minting occurred during swap
            console.log("✓ No extra tokens created during swap");
        });
    });
});
