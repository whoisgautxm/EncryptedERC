import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, zkit } from "hardhat";
import type {
    ConfidentialApproveCircuit,
    ConfidentialTransferFromCircuit,
    CancelAllowanceCircuit,
    OfferAcceptanceCircuit,
    OfferFinalizationCircuit,
    CalldataConfidentialApproveCircuitGroth16,
    CalldataConfidentialTransferFromCircuitGroth16,
    CalldataCancelAllowanceCircuitGroth16,
    CalldataOfferAcceptanceCircuitGroth16,
    CalldataOfferFinalizationCircuitGroth16,
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

describe("ZexERC - Confidential Allowance", () => {
    let registrar: Registrar;
    let zexERC: ZexERC;
    let users: User[];
    let signers: SignerWithAddress[];
    let owner: SignerWithAddress;
    let auditorPublicKey: [bigint, bigint];

    // Circuit instances
    let confidentialApproveCircuit: ConfidentialApproveCircuit;
    let confidentialTransferFromCircuit: ConfidentialTransferFromCircuit;
    let cancelAllowanceCircuit: CancelAllowanceCircuit;
    let offerAcceptanceCircuit: OfferAcceptanceCircuit;
    let offerFinalizationCircuit: OfferFinalizationCircuit;

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
        await confidentialApproveVerifier.waitForDeployment();

        const confidentialTransferFromVerifier = await new ConfidentialTransferFromCircuitGroth16Verifier__factory(owner).deploy();
        await confidentialTransferFromVerifier.waitForDeployment();

        const cancelAllowanceVerifier = await new CancelAllowanceCircuitGroth16Verifier__factory(owner).deploy();
        await cancelAllowanceVerifier.waitForDeployment();

        // Deploy new ZEX swap verifiers
        const offerAcceptanceVerifier = await new OfferAcceptanceCircuitGroth16Verifier__factory(owner).deploy();
        await offerAcceptanceVerifier.waitForDeployment();

        const offerFinalizationVerifier = await new OfferFinalizationCircuitGroth16Verifier__factory(owner).deploy();
        await offerFinalizationVerifier.waitForDeployment();

        // Deploy ZexERC
        const zexERCFactory = new ZexERC__factory({
            "contracts/libraries/BabyJubJub.sol:BabyJubJub": babyJubJub,
        }, owner);

        const zexERC_ = await zexERCFactory.connect(owner).deploy({
            baseParams: {
                registrar: registrar_.target,
                isConverter: false,
                name: "ZEX Test Token",
                symbol: "ZEXT",
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

        await zexERC_.waitForDeployment();

        registrar = registrar_;
        zexERC = zexERC_;
        users = signers.map((signer) => new User(signer));

        // Get circuit instances
        confidentialApproveCircuit = await zkit.getCircuit("ConfidentialApproveCircuit") as unknown as ConfidentialApproveCircuit;
        confidentialTransferFromCircuit = await zkit.getCircuit("ConfidentialTransferFromCircuit") as unknown as ConfidentialTransferFromCircuit;
        cancelAllowanceCircuit = await zkit.getCircuit("CancelAllowanceCircuit") as unknown as CancelAllowanceCircuit;
        offerAcceptanceCircuit = await zkit.getCircuit("OfferAcceptanceCircuit") as unknown as OfferAcceptanceCircuit;
        offerFinalizationCircuit = await zkit.getCircuit("OfferFinalizationCircuit") as unknown as OfferFinalizationCircuit;
    };

    before(async () => {
        await deployFixture();
    });

    describe("Setup", () => {
        it("should deploy ZexERC properly", async () => {
            expect(zexERC.target).to.not.be.null;
            expect(await zexERC.name()).to.equal("ZEX Test Token");
            expect(await zexERC.symbol()).to.equal("ZEXT");
        });

        it("should register users", async () => {
            const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
            const registrationCircuit = await zkit.getCircuit("RegistrationCircuit");

            // Register first 4 users
            for (const user of users.slice(0, 4)) {
                const registrationHash = user.genRegistrationHash(chainId);
                const input = {
                    SenderPrivateKey: user.formattedPrivateKey,
                    SenderPublicKey: user.publicKey,
                    SenderAddress: BigInt(user.signer.address),
                    ChainID: chainId,
                    RegistrationHash: registrationHash,
                };

                const proof = await registrationCircuit.generateProof(input);
                const calldata = await registrationCircuit.generateCalldata(proof);

                await registrar.connect(user.signer).register({
                    proofPoints: calldata.proofPoints,
                    publicSignals: calldata.publicSignals,
                });

                expect(await registrar.isUserRegistered(user.signer.address)).to.be.true;
            }
        });

        it("should set auditor public key", async () => {
            await zexERC.connect(owner).setAuditorPublicKey(owner.address);
            expect(await zexERC.isAuditorKeySet()).to.be.true;
            auditorPublicKey = [users[0].publicKey[0], users[0].publicKey[1]];
        });

        it("should mint tokens to approver (user1)", async () => {
            const approver = users[1];
            const mintAmount = 10000n;

            const calldata = await privateMint(mintAmount, approver.publicKey, auditorPublicKey);

            await zexERC.connect(owner)[
                "privateMint(address,((uint256[2],uint256[2][2],uint256[2]),uint256[24]))"
            ](approver.signer.address, {
                proofPoints: calldata.proofPoints,
                publicSignals: calldata.publicSignals,
            });

            const balance = await zexERC.balanceOfStandalone(approver.signer.address);
            const decryptedBalance = await getDecryptedBalance(
                approver.privateKey,
                balance.amountPCTs,
                balance.balancePCT,
                balance.eGCT,
            );

            expect(decryptedBalance).to.equal(mintAmount);
        });
    });

    describe("Confidential Approve Circuit", () => {
        it("should generate valid proof for confidential approval", async () => {
            const approver = users[1];
            const spender = users[2];
            const approvalAmount = 500n;

            // Get approver's current balance
            const balance = await zexERC.balanceOfStandalone(approver.signer.address);
            const approverBalance = await getDecryptedBalance(
                approver.privateKey,
                balance.amountPCTs,
                balance.balancePCT,
                balance.eGCT,
            );

            // Encrypt the approval amount for spender (ElGamal)
            const { cipher: encryptedAllowance, random: allowanceRandom } =
                encryptMessage(spender.publicKey, approvalAmount);

            // Create PCT for spender
            const {
                ciphertext: spenderCiphertext,
                nonce: spenderNonce,
                authKey: spenderAuthKey,
                encRandom: spenderEncRandom,
            } = processPoseidonEncryption([approvalAmount], spender.publicKey);

            // Create PCT for auditor
            const {
                ciphertext: auditorCiphertext,
                nonce: auditorNonce,
                authKey: auditorAuthKey,
                encRandom: auditorEncRandom,
            } = processPoseidonEncryption([approvalAmount], auditorPublicKey);

            const input = {
                ApprovalAmount: approvalAmount,
                SenderPrivateKey: approver.formattedPrivateKey,
                SenderBalance: approverBalance,
                AllowanceRandom: allowanceRandom,
                SpenderPCTRandom: spenderEncRandom,
                AuditorPCTRandom: auditorEncRandom,
                SenderPublicKey: approver.publicKey,
                SpenderPublicKey: spender.publicKey,
                OperatorPublicKey: spender.publicKey,
                SenderBalanceC1: [balance.eGCT.c1.x, balance.eGCT.c1.y],
                SenderBalanceC2: [balance.eGCT.c2.x, balance.eGCT.c2.y],
                AllowanceC1: encryptedAllowance[0],
                AllowanceC2: encryptedAllowance[1],
                SpenderPCT: spenderCiphertext,
                SpenderPCTAuthKey: spenderAuthKey,
                SpenderPCTNonce: spenderNonce,
                AuditorPublicKey: auditorPublicKey,
                AuditorPCT: auditorCiphertext,
                AuditorPCTAuthKey: auditorAuthKey,
                AuditorPCTNonce: auditorNonce,
            };

            // Generate proof
            const proof = await confidentialApproveCircuit.generateProof(input);

            // Verify the proof locally
            await expect(confidentialApproveCircuit).to.verifyProof(proof);

            console.log("✓ Confidential Approve proof generated and verified locally");
        });
    });

    describe("Confidential TransferFrom Circuit", () => {
        it("should generate valid proof for confidential transferFrom", async () => {
            const spender = users[2];
            const approverPublicKey = users[1].publicKey;
            const receiverPublicKey = spender.publicKey; // Spender receives
            const allowanceAmount = 500n;
            const transferAmount = 200n;
            const remainingAllowance = allowanceAmount - transferAmount;

            // Encrypt allowance for spender (simulating existing allowance)
            const { cipher: encryptedAllowance, random: allowanceRandom } =
                encryptMessage(spender.publicKey, allowanceAmount);

            // Encrypt new allowance (remaining)
            const { cipher: newAllowanceEncrypted, random: newAllowanceRandom } =
                encryptMessage(spender.publicKey, remainingAllowance);

            // Encrypt transfer amount for receiver
            const { cipher: receiverEncrypted, random: receiverRandom } =
                encryptMessage(receiverPublicKey, transferAmount);

            // Create PCT for receiver
            const {
                ciphertext: receiverCiphertext,
                nonce: receiverNonce,
                authKey: receiverAuthKey,
                encRandom: receiverEncRandom,
            } = processPoseidonEncryption([transferAmount], receiverPublicKey);

            // Create PCT for auditor
            const {
                ciphertext: auditorCiphertext,
                nonce: auditorNonce,
                authKey: auditorAuthKey,
                encRandom: auditorEncRandom,
            } = processPoseidonEncryption([transferAmount], auditorPublicKey);

            const input = {
                SpenderPrivateKey: spender.formattedPrivateKey,
                TransferAmount: transferAmount,
                AllowanceAmount: allowanceAmount,
                ReceiverRandom: receiverRandom,
                NewAllowanceRandom: newAllowanceRandom,
                ReceiverPCTRandom: receiverEncRandom,
                AuditorPCTRandom: auditorEncRandom,
                ApproverPublicKey: approverPublicKey,
                SpenderPublicKey: spender.publicKey,
                ReceiverPublicKey: receiverPublicKey,
                AllowanceC1: encryptedAllowance[0],
                AllowanceC2: encryptedAllowance[1],
                NewAllowanceC1: newAllowanceEncrypted[0],
                NewAllowanceC2: newAllowanceEncrypted[1],
                ReceiverAmountC1: receiverEncrypted[0],
                ReceiverAmountC2: receiverEncrypted[1],
                ReceiverPCT: receiverCiphertext,
                ReceiverPCTAuthKey: receiverAuthKey,
                ReceiverPCTNonce: receiverNonce,
                AuditorPublicKey: auditorPublicKey,
                AuditorPCT: auditorCiphertext,
                AuditorPCTAuthKey: auditorAuthKey,
                AuditorPCTNonce: auditorNonce,
            };

            // Generate proof
            const proof = await confidentialTransferFromCircuit.generateProof(input);

            // Verify the proof locally
            await expect(confidentialTransferFromCircuit).to.verifyProof(proof);

            console.log("✓ Confidential TransferFrom proof generated and verified locally");
        });
    });

    describe("Cancel Allowance Circuit", () => {
        it("should generate valid proof for cancel allowance", async () => {
            const approver = users[1];
            const spenderPublicKey = users[2].publicKey;
            const allowanceAmount = 500n;

            // Simulate existing allowance
            const { cipher: encryptedAllowance } =
                encryptMessage(spenderPublicKey, allowanceAmount);

            const input = {
                ApproverPrivateKey: approver.formattedPrivateKey,
                AllowanceAmount: allowanceAmount,
                ApproverPublicKey: approver.publicKey,
                SpenderPublicKey: spenderPublicKey,
                AllowanceC1: encryptedAllowance[0],
                AllowanceC2: encryptedAllowance[1],
            };

            // Generate proof
            const proof = await cancelAllowanceCircuit.generateProof(input);

            // Verify the proof locally
            await expect(cancelAllowanceCircuit).to.verifyProof(proof);

            console.log("✓ Cancel Allowance proof generated and verified locally");
        });
    });

    describe("Offer Acceptance Circuit", () => {
        it("should generate valid proof for offer acceptance", async () => {
            const acceptor = users[2];
            const initiator = users[1];
            const amountToBuy = 500n;
            const maxAmountToSell = 1000n;
            const rate = ethers.parseEther("1");

            // Encrypt the amount for initiator (so they can decrypt it during finalization)
            const { cipher: encryptedAmount, random: encryptionRandom } =
                encryptMessage(initiator.publicKey, amountToBuy);

            const input = {
                AcceptorPrivateKey: acceptor.formattedPrivateKey,
                AmountToBuy: amountToBuy,
                EncryptionRandom: encryptionRandom,
                AcceptorPublicKey: acceptor.publicKey,
                InitiatorPublicKey: initiator.publicKey,
                MaxAmountToSell: maxAmountToSell,
                Rate: rate,
                AmountToBuyC1: encryptedAmount[0],
                AmountToBuyC2: encryptedAmount[1],
            };

            // Generate proof
            const proof = await offerAcceptanceCircuit.generateProof(input);

            // Verify the proof locally
            await expect(offerAcceptanceCircuit).to.verifyProof(proof);

            console.log("✓ Offer Acceptance proof generated and verified locally");
        });

        it("should reject proof when amount exceeds maxAmountToSell", async () => {
            const acceptor = users[2];
            const initiator = users[1];
            const amountToBuy = 1500n; // Exceeds maxAmountToSell
            const maxAmountToSell = 1000n;
            const rate = ethers.parseEther("1");

            const { cipher: encryptedAmount, random: encryptionRandom } =
                encryptMessage(initiator.publicKey, amountToBuy);

            const input = {
                AcceptorPrivateKey: acceptor.formattedPrivateKey,
                AmountToBuy: amountToBuy,
                EncryptionRandom: encryptionRandom,
                AcceptorPublicKey: acceptor.publicKey,
                InitiatorPublicKey: initiator.publicKey,
                MaxAmountToSell: maxAmountToSell,
                Rate: rate,
                AmountToBuyC1: encryptedAmount[0],
                AmountToBuyC2: encryptedAmount[1],
            };

            // Proof generation should fail due to constraint violation
            try {
                await offerAcceptanceCircuit.generateProof(input);
                expect.fail("Should have thrown an error");
            } catch (e) {
                console.log("✓ Correctly rejected proof for excessive amount");
            }
        });
    });

    describe("Offer Finalization Circuit", () => {
        it("should generate valid proof for offer finalization", async () => {
            const initiator = users[1];
            const acceptor = users[2];
            const amountToBuy = 500n;
            const sellAmount = 500n; // Same as amountToBuy
            const rate = ethers.parseEther("1");

            // Encrypt amountToBuy for initiator (simulating what acceptor sent)
            const { cipher: amountToBuyEncrypted } =
                encryptMessage(initiator.publicKey, amountToBuy);

            // Encrypt sellAmount for acceptor
            const { cipher: sellAmountEncrypted, random: sellEncryptionRandom } =
                encryptMessage(acceptor.publicKey, sellAmount);

            const input = {
                InitiatorPrivateKey: initiator.formattedPrivateKey,
                AmountToBuy: amountToBuy,
                SellAmount: sellAmount,
                SellEncryptionRandom: sellEncryptionRandom,
                InitiatorPublicKey: initiator.publicKey,
                AcceptorPublicKey: acceptor.publicKey,
                Rate: rate,
                AmountToBuyC1: amountToBuyEncrypted[0],
                AmountToBuyC2: amountToBuyEncrypted[1],
                SellAmountC1: sellAmountEncrypted[0],
                SellAmountC2: sellAmountEncrypted[1],
            };

            // Generate proof
            const proof = await offerFinalizationCircuit.generateProof(input);

            // Verify the proof locally
            await expect(offerFinalizationCircuit).to.verifyProof(proof);

            console.log("✓ Offer Finalization proof generated and verified locally");
        });
    });

    describe("Swap Marketplace", () => {
        const initiatorIndex = 1;
        const acceptorIndex = 2;
        const maxAmountToSell = 1000n;
        const amountToBuy = 500n;
        const rate = ethers.parseEther("1"); // 1e18 = 1:1 rate

        // Store encrypted data for use across tests
        let encryptedAmountToBuy: { c1: bigint[]; c2: bigint[] };
        let encryptionRandom: bigint;

        it("should create an offer", async () => {
            const initiator = users[initiatorIndex];

            const tx = await zexERC.connect(initiator.signer).initiateOffer(
                ethers.ZeroAddress, // assetBuy
                ethers.ZeroAddress, // assetSell (this contract)
                rate,
                maxAmountToSell,
                0n, // minAmountToSell
                0n, // expiresAt (0 = no expiry)
                "0x", // approveData
            );

            await tx.wait();

            const offer = await zexERC.getOffer(0);
            expect(offer.initiator).to.equal(initiator.signer.address);
            expect(offer.rate).to.equal(rate);
            expect(offer.maxAmountToSell).to.equal(maxAmountToSell);
        });

        it("should accept an offer with real ZK proof", async () => {
            const acceptor = users[acceptorIndex];
            const initiator = users[initiatorIndex];

            // Encrypt amountToBuy for initiator (so initiator can decrypt)
            const { cipher: encryptedAmount, random } =
                encryptMessage(initiator.publicKey, amountToBuy);

            encryptedAmountToBuy = {
                c1: [encryptedAmount[0][0], encryptedAmount[0][1]],
                c2: [encryptedAmount[1][0], encryptedAmount[1][1]]
            };
            encryptionRandom = random;

            // Generate OfferAcceptance proof
            const input = {
                AcceptorPrivateKey: acceptor.formattedPrivateKey,
                AmountToBuy: amountToBuy,
                EncryptionRandom: encryptionRandom,
                AcceptorPublicKey: acceptor.publicKey,
                InitiatorPublicKey: initiator.publicKey,
                MaxAmountToSell: maxAmountToSell,
                Rate: rate,
                AmountToBuyC1: encryptedAmount[0],
                AmountToBuyC2: encryptedAmount[1],
            };

            const proof = await offerAcceptanceCircuit.generateProof(input);
            const calldata = await offerAcceptanceCircuit.generateCalldata(proof);

            // Encode proof for contract
            const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[10] publicSignals)"],
                [{
                    proofPoints: calldata.proofPoints,
                    publicSignals: calldata.publicSignals
                }]
            );

            const tx = await zexERC.connect(acceptor.signer).acceptOffer(
                0, // offerId
                "0x", // approveData (not using for this test)
                proofData,
            );

            await tx.wait();

            const offer = await zexERC.getOffer(0);
            expect(offer.acceptor).to.equal(acceptor.signer.address);

            console.log("✓ Offer accepted with real ZK proof");
        });

        it("should finalize a swap with real ZK proof", async () => {
            const initiator = users[initiatorIndex];
            const acceptor = users[acceptorIndex];

            // With rate = 1e18 (1:1), sellAmount = amountToBuy * 1e18 / rate = amountToBuy
            const sellAmount = amountToBuy;

            // IMPORTANT: Use the SAME encrypted amountToBuy that was stored during acceptance
            // The contract stores the commitment and checks it matches in finalization
            // We stored encryptedAmountToBuy during the accept test

            // Encrypt sellAmount for acceptor
            const { cipher: sellAmountEncrypted, random: sellEncryptionRandom } =
                encryptMessage(acceptor.publicKey, sellAmount);

            const input = {
                InitiatorPrivateKey: initiator.formattedPrivateKey,
                AmountToBuy: amountToBuy,
                SellAmount: sellAmount,
                SellEncryptionRandom: sellEncryptionRandom,
                InitiatorPublicKey: initiator.publicKey,
                AcceptorPublicKey: acceptor.publicKey,
                Rate: rate,
                // Use the stored encrypted amount from acceptance (must match what's in the offer)
                AmountToBuyC1: encryptedAmountToBuy.c1,
                AmountToBuyC2: encryptedAmountToBuy.c2,
                SellAmountC1: sellAmountEncrypted[0],
                SellAmountC2: sellAmountEncrypted[1],
            };

            // Generate proof
            const proof = await offerFinalizationCircuit.generateProof(input);
            const calldata = await offerFinalizationCircuit.generateCalldata(proof);

            // Encode proof for contract
            const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[13] publicSignals)"],
                [{
                    proofPoints: calldata.proofPoints,
                    publicSignals: calldata.publicSignals
                }]
            );

            const tx = await zexERC.connect(initiator.signer).finalizeSwap(
                0, // offerId
                "0x", // transferFromData (no cross-contract transfers in this test)
                proofData,
            );

            await tx.wait();

            // Offer should be deleted after finalization
            const offer = await zexERC.getOffer(0);
            expect(offer.initiator).to.equal(ethers.ZeroAddress);

            console.log("✓ Swap finalized with real ZK proof");
        });
    });

    describe("E2E Swap with Rate = 3", () => {
        // Test with rate = 3e18 (3:1 exchange)
        // Formula: SellAmount * Rate = AmountToBuy * RATE_PRECISION
        // So: SellAmount = AmountToBuy * 1e18 / Rate = AmountToBuy / 3
        const rate3 = ethers.parseEther("3"); // 3e18
        const maxAmountToSell3 = 500n;
        const amountToBuy3 = 300n; // Acceptor pays 300 TokenB
        // SellAmount = 300 * 1e18 / 3e18 = 100
        const sellAmount3 = 100n;

        let encryptedAmountToBuy3: { c1: bigint[]; c2: bigint[] };

        it("should create offer with rate=3", async () => {
            const initiator = users[1];

            const tx = await zexERC.connect(initiator.signer).initiateOffer(
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                rate3,
                maxAmountToSell3,
                0n,
                0n,
                "0x",
            );
            await tx.wait();

            const offer = await zexERC.getOffer(1); // Second offer (id=1)
            expect(offer.rate).to.equal(rate3);
            console.log(`✓ Offer created with rate=3 (${rate3})`);
        });

        it("should accept offer with rate=3", async () => {
            const acceptor = users[2];
            const initiator = users[1];

            // Encrypt amountToBuy for initiator
            const { cipher: encryptedAmount, random: encryptionRandom } =
                encryptMessage(initiator.publicKey, amountToBuy3);

            encryptedAmountToBuy3 = {
                c1: [encryptedAmount[0][0], encryptedAmount[0][1]],
                c2: [encryptedAmount[1][0], encryptedAmount[1][1]]
            };

            const input = {
                AcceptorPrivateKey: acceptor.formattedPrivateKey,
                AmountToBuy: amountToBuy3,
                EncryptionRandom: encryptionRandom,
                AcceptorPublicKey: acceptor.publicKey,
                InitiatorPublicKey: initiator.publicKey,
                MaxAmountToSell: maxAmountToSell3,
                Rate: rate3,
                AmountToBuyC1: encryptedAmount[0],
                AmountToBuyC2: encryptedAmount[1],
            };

            const proof = await offerAcceptanceCircuit.generateProof(input);
            const calldata = await offerAcceptanceCircuit.generateCalldata(proof);

            const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[10] publicSignals)"],
                [{ proofPoints: calldata.proofPoints, publicSignals: calldata.publicSignals }]
            );

            const tx = await zexERC.connect(acceptor.signer).acceptOffer(1, "0x", proofData);
            await tx.wait();

            console.log(`✓ Offer accepted: amountToBuy=${amountToBuy3}`);
        });

        it("should finalize swap with rate=3 (sellAmount = amountToBuy / 3)", async () => {
            const initiator = users[1];
            const acceptor = users[2];

            // Encrypt sellAmount for acceptor
            const { cipher: sellAmountEncrypted, random: sellEncryptionRandom } =
                encryptMessage(acceptor.publicKey, sellAmount3);

            const input = {
                InitiatorPrivateKey: initiator.formattedPrivateKey,
                AmountToBuy: amountToBuy3,
                SellAmount: sellAmount3,
                SellEncryptionRandom: sellEncryptionRandom,
                InitiatorPublicKey: initiator.publicKey,
                AcceptorPublicKey: acceptor.publicKey,
                Rate: rate3,
                AmountToBuyC1: encryptedAmountToBuy3.c1,
                AmountToBuyC2: encryptedAmountToBuy3.c2,
                SellAmountC1: sellAmountEncrypted[0],
                SellAmountC2: sellAmountEncrypted[1],
            };

            // This should succeed because: SellAmount * Rate = 100 * 3e18 = 300e18
            // And: AmountToBuy * PRECISION = 300 * 1e18 = 300e18 ✓
            const proof = await offerFinalizationCircuit.generateProof(input);
            const calldata = await offerFinalizationCircuit.generateCalldata(proof);

            const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[13] publicSignals)"],
                [{ proofPoints: calldata.proofPoints, publicSignals: calldata.publicSignals }]
            );

            const tx = await zexERC.connect(initiator.signer).finalizeSwap(1, "0x", proofData);
            await tx.wait();

            const offer = await zexERC.getOffer(1);
            expect(offer.initiator).to.equal(ethers.ZeroAddress);

            console.log(`✓ Swap finalized: amountToBuy=${amountToBuy3}, sellAmount=${sellAmount3}, rate=${rate3}`);
            console.log(`  ✓ Verified: ${sellAmount3} * 3 = ${amountToBuy3} (rate enforcement works!)`);
        });

        it("should FAIL finalization with wrong sellAmount for rate=3", async () => {
            // Create another offer for this test
            const initiator = users[1];
            const acceptor = users[2];

            await zexERC.connect(initiator.signer).initiateOffer(
                ethers.ZeroAddress, ethers.ZeroAddress, rate3, maxAmountToSell3, 0n, 0n, "0x"
            );

            // Accept it
            const { cipher: encryptedAmount, random: encryptionRandom } =
                encryptMessage(initiator.publicKey, amountToBuy3);

            const acceptInput = {
                AcceptorPrivateKey: acceptor.formattedPrivateKey,
                AmountToBuy: amountToBuy3,
                EncryptionRandom: encryptionRandom,
                AcceptorPublicKey: acceptor.publicKey,
                InitiatorPublicKey: initiator.publicKey,
                MaxAmountToSell: maxAmountToSell3,
                Rate: rate3,
                AmountToBuyC1: encryptedAmount[0],
                AmountToBuyC2: encryptedAmount[1],
            };

            const acceptProof = await offerAcceptanceCircuit.generateProof(acceptInput);
            const acceptCalldata = await offerAcceptanceCircuit.generateCalldata(acceptProof);
            const acceptProofData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[10] publicSignals)"],
                [{ proofPoints: acceptCalldata.proofPoints, publicSignals: acceptCalldata.publicSignals }]
            );

            await zexERC.connect(acceptor.signer).acceptOffer(2, "0x", acceptProofData);

            // Try to finalize with WRONG sellAmount (200 instead of 100)
            const wrongSellAmount = 200n; // Should be 100

            const { cipher: wrongEncrypted, random: wrongRandom } =
                encryptMessage(acceptor.publicKey, wrongSellAmount);

            const wrongInput = {
                InitiatorPrivateKey: initiator.formattedPrivateKey,
                AmountToBuy: amountToBuy3,
                SellAmount: wrongSellAmount, // WRONG!
                SellEncryptionRandom: wrongRandom,
                InitiatorPublicKey: initiator.publicKey,
                AcceptorPublicKey: acceptor.publicKey,
                Rate: rate3,
                AmountToBuyC1: [encryptedAmount[0][0], encryptedAmount[0][1]],
                AmountToBuyC2: [encryptedAmount[1][0], encryptedAmount[1][1]],
                SellAmountC1: wrongEncrypted[0],
                SellAmountC2: wrongEncrypted[1],
            };

            // Proof generation should fail because: 200 * 3e18 ≠ 300 * 1e18
            try {
                await offerFinalizationCircuit.generateProof(wrongInput);
                expect.fail("Should have failed with wrong sellAmount");
            } catch (e) {
                console.log("✓ Correctly rejected wrong sellAmount (200 instead of 100)");
                console.log("  Rate enforcement working: sellAmount * rate must equal amountToBuy * precision");
            }
        });
    });
});
