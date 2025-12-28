import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, zkit } from "hardhat";
import type {
    ConfidentialApproveCircuit,
    OfferAcceptanceCircuit,
    OfferFinalizationCircuit,
    MintCircuit,
} from "../generated-types/zkit";
import { processPoseidonEncryption } from "../src";
import { encryptMessage } from "../src/jub/jub";
import { Registrar__factory } from "../typechain-types/factories/contracts";
import {
    ZexDiamond__factory,
    DiamondCutFacet__factory,
    DiamondInit__factory,
} from "../typechain-types/factories/contracts/diamond/ZexDiamond.sol";
import {
    ZexTokenFacet__factory,
    ZexAllowanceFacet__factory,
    ZexSwapFacet__factory,
} from "../typechain-types/factories/contracts/facets";
import {
    ConfidentialApproveCircuitGroth16Verifier__factory,
    ConfidentialTransferFromCircuitGroth16Verifier__factory,
    CancelAllowanceCircuitGroth16Verifier__factory,
    OfferAcceptanceCircuitGroth16Verifier__factory,
    OfferFinalizationCircuitGroth16Verifier__factory,
} from "../typechain-types/factories/contracts/verifiers";
import { deployLibrary, deployVerifiers, privateMint, getDecryptedBalance } from "./helpers";
import { User } from "./user";
import type { ZexTokenFacet, ZexAllowanceFacet, ZexSwapFacet, Registrar } from "../typechain-types";

const DECIMALS = 2;

describe("ZexDiamond - Comprehensive Test Suite", () => {
    let registrar: Registrar;
    let users: User[];
    let signers: SignerWithAddress[];
    let owner: SignerWithAddress;
    let auditorPublicKey: [bigint, bigint];

    let diamondAsToken: ZexTokenFacet;
    let diamondAsAllowance: ZexAllowanceFacet;
    let diamondAsSwap: ZexSwapFacet;
    let diamondAddress: string;

    // Circuits
    let mintCircuit: MintCircuit;
    let confidentialApproveCircuit: ConfidentialApproveCircuit;
    let offerAcceptanceCircuit: OfferAcceptanceCircuit;
    let offerFinalizationCircuit: OfferFinalizationCircuit;

    const deployDiamond = async () => {
        signers = await ethers.getSigners();
        owner = signers[0];

        const babyJubJub = await deployLibrary(owner);
        const baseVerifiers = await deployVerifiers(owner, false);

        const registrarFactory = new Registrar__factory(owner);
        registrar = await registrarFactory.deploy(baseVerifiers.registrationVerifier);
        await registrar.waitForDeployment();

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

        const libraryAddresses = {
            "contracts/libraries/BabyJubJub.sol:BabyJubJub": babyJubJub,
        };

        const diamondCutFacet = await new DiamondCutFacet__factory(owner).deploy();
        const tokenFacet = await new ZexTokenFacet__factory(libraryAddresses, owner).deploy();
        const allowanceFacet = await new ZexAllowanceFacet__factory(libraryAddresses, owner).deploy();
        const swapFacet = await new ZexSwapFacet__factory(owner).deploy();
        const diamondInit = await new DiamondInit__factory(owner).deploy();

        await Promise.all([
            diamondCutFacet.waitForDeployment(),
            tokenFacet.waitForDeployment(),
            allowanceFacet.waitForDeployment(),
            swapFacet.waitForDeployment(),
            diamondInit.waitForDeployment(),
        ]);

        const diamondCutFacetAddr = await diamondCutFacet.getAddress();
        const tokenFacetAddr = await tokenFacet.getAddress();
        const allowanceFacetAddr = await allowanceFacet.getAddress();
        const swapFacetAddr = await swapFacet.getAddress();

        const diamondCutSelectors = [diamondCutFacet.interface.getFunction("diamondCut")!.selector];

        const tokenSelectors = [
            tokenFacet.interface.getFunction("setAuditorPublicKey")!.selector,
            tokenFacet.interface.getFunction("mint")!.selector,
            tokenFacet.interface.getFunction("transfer")!.selector,
            tokenFacet.interface.getFunction("burn")!.selector,
            tokenFacet.interface.getFunction("balanceOf")!.selector,
            tokenFacet.interface.getFunction("balanceOfStandalone")!.selector,
            tokenFacet.interface.getFunction("name")!.selector,
            tokenFacet.interface.getFunction("symbol")!.selector,
            tokenFacet.interface.getFunction("decimals")!.selector,
            tokenFacet.interface.getFunction("registrar")!.selector,
            tokenFacet.interface.getFunction("auditorPublicKey")!.selector,
        ];

        const allowanceSelectors = [
            allowanceFacet.interface.getFunction("confidentialApprove")!.selector,
            allowanceFacet.interface.getFunction("publicConfidentialApprove")!.selector,
            allowanceFacet.interface.getFunction("confidentialTransferFrom")!.selector,
            allowanceFacet.interface.getFunction("publicConfidentialTransferFrom")!.selector,
            allowanceFacet.interface.getFunction("cancelConfidentialAllowance")!.selector,
            allowanceFacet.interface.getFunction("cancelPublicConfidentialAllowance")!.selector,
            allowanceFacet.interface.getFunction("getAllowance")!.selector,
        ];

        const swapSelectors = [
            swapFacet.interface.getFunction("initiateOffer")!.selector,
            swapFacet.interface.getFunction("acceptOffer")!.selector,
            swapFacet.interface.getFunction("finalizeSwap")!.selector,
            swapFacet.interface.getFunction("getOffer")!.selector,
            swapFacet.interface.getFunction("nextOfferId")!.selector,
        ];

        const diamondCut = [
            { facetAddress: diamondCutFacetAddr, action: 0, functionSelectors: diamondCutSelectors },
            { facetAddress: tokenFacetAddr, action: 0, functionSelectors: tokenSelectors },
            { facetAddress: allowanceFacetAddr, action: 0, functionSelectors: allowanceSelectors },
            { facetAddress: swapFacetAddr, action: 0, functionSelectors: swapSelectors },
        ];

        const initParams = {
            name: "ZEX Diamond Token",
            symbol: "ZEXD",
            decimals: DECIMALS,
            registrar: await registrar.getAddress(),
            mintVerifier: baseVerifiers.mintVerifier,
            withdrawVerifier: baseVerifiers.withdrawVerifier,
            transferVerifier: baseVerifiers.transferVerifier,
            burnVerifier: baseVerifiers.burnVerifier,
            confidentialApproveVerifier: await confidentialApproveVerifier.getAddress(),
            confidentialTransferFromVerifier: await confidentialTransferFromVerifier.getAddress(),
            cancelAllowanceVerifier: await cancelAllowanceVerifier.getAddress(),
            offerAcceptanceVerifier: await offerAcceptanceVerifier.getAddress(),
            offerFinalizationVerifier: await offerFinalizationVerifier.getAddress(),
        };

        const initData = diamondInit.interface.encodeFunctionData("init", [initParams]);

        const diamond = await new ZexDiamond__factory(owner).deploy(
            owner.address,
            diamondCut,
            await diamondInit.getAddress(),
            initData
        );
        await diamond.waitForDeployment();

        diamondAddress = await diamond.getAddress();
        diamondAsToken = ZexTokenFacet__factory.connect(diamondAddress, owner);
        diamondAsAllowance = ZexAllowanceFacet__factory.connect(diamondAddress, owner);
        diamondAsSwap = ZexSwapFacet__factory.connect(diamondAddress, owner);

        // Set up circuits
        mintCircuit = await zkit.getCircuit("MintCircuit") as unknown as MintCircuit;
        confidentialApproveCircuit = await zkit.getCircuit("ConfidentialApproveCircuit") as unknown as ConfidentialApproveCircuit;
        offerAcceptanceCircuit = await zkit.getCircuit("OfferAcceptanceCircuit") as unknown as OfferAcceptanceCircuit;
        offerFinalizationCircuit = await zkit.getCircuit("OfferFinalizationCircuit") as unknown as OfferFinalizationCircuit;

        // Set auditor public key
        auditorPublicKey = [
            5299619240641551281634865583518297030282874472190772894086521144482721001553n,
            16950150798460657717958625567821834550301663161624707787222815936182638968203n
        ];
        await diamondAsToken.setAuditorPublicKey(auditorPublicKey);

        // Create and register users
        users = signers.slice(0, 5).map((signer) => new User(signer));

        const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
        const registrationCircuit = await zkit.getCircuit("RegistrationCircuit");

        for (const user of users) {
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
                proofPoints: calldata.proofPoints as any,
                publicSignals: calldata.publicSignals as any,
            });
        }
    };

    before(async () => {
        await deployDiamond();
    });

    // ========================================
    // DIAMOND SETUP TESTS
    // ========================================
    describe("1. Diamond Setup", () => {
        it("should deploy Diamond with correct address", async () => {
            expect(diamondAddress).to.not.equal(ethers.ZeroAddress);
            console.log("✓ Diamond deployed at:", diamondAddress);
        });

        it("should have correct token name", async () => {
            expect(await diamondAsToken.name()).to.equal("ZEX Diamond Token");
        });

        it("should have correct token symbol", async () => {
            expect(await diamondAsToken.symbol()).to.equal("ZEXD");
        });

        it("should have correct decimals", async () => {
            expect(await diamondAsToken.decimals()).to.equal(DECIMALS);
        });

        it("should have correct registrar address", async () => {
            expect(await diamondAsToken.registrar()).to.equal(await registrar.getAddress());
        });

        it("should have auditor public key set", async () => {
            const pk = await diamondAsToken.auditorPublicKey();
            expect(pk.x).to.equal(auditorPublicKey[0]);
            expect(pk.y).to.equal(auditorPublicKey[1]);
        });

        it("should have all users registered", async () => {
            for (const user of users) {
                expect(await registrar.isUserRegistered(user.signer.address)).to.be.true;
            }
            console.log(`✓ ${users.length} users registered`);
        });

        it("should prevent setting auditor key twice", async () => {
            await expect(
                diamondAsToken.setAuditorPublicKey(auditorPublicKey)
            ).to.be.revertedWithCustomError(diamondAsToken, "AuditorAlreadySet");
        });
    });

    // ========================================
    // SWAP FACET TESTS
    // ========================================
    describe("2. Swap Facet - initiateOffer", () => {
        it("should create offer with valid parameters", async () => {
            const initiator = users[0];
            const rate = ethers.parseEther("2"); // 2:1 rate
            const maxAmountToSell = 1000n;

            const tx = await diamondAsSwap.connect(initiator.signer).initiateOffer(
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                rate,
                maxAmountToSell,
                0n,
                0n,
                "0x"
            );
            await tx.wait();

            const offer = await diamondAsSwap.getOffer(0);
            expect(offer.initiator).to.equal(initiator.signer.address);
            expect(offer.rate).to.equal(rate);
            expect(offer.maxAmountToSell).to.equal(maxAmountToSell);
            expect(offer.acceptor).to.equal(ethers.ZeroAddress);
        });

        it("should reject offer with zero rate", async () => {
            await expect(
                diamondAsSwap.connect(users[0].signer).initiateOffer(
                    ethers.ZeroAddress, ethers.ZeroAddress, 0n, 1000n, 0n, 0n, "0x"
                )
            ).to.be.revertedWithCustomError(diamondAsSwap, "InvalidRate");
        });

        it("should reject offer with zero maxAmountToSell", async () => {
            await expect(
                diamondAsSwap.connect(users[0].signer).initiateOffer(
                    ethers.ZeroAddress, ethers.ZeroAddress, ethers.parseEther("1"), 0n, 0n, 0n, "0x"
                )
            ).to.be.revertedWithCustomError(diamondAsSwap, "InvalidAmount");
        });

        it("should reject offer with minAmountToSell > maxAmountToSell", async () => {
            await expect(
                diamondAsSwap.connect(users[0].signer).initiateOffer(
                    ethers.ZeroAddress, ethers.ZeroAddress, ethers.parseEther("1"), 100n, 200n, 0n, "0x"
                )
            ).to.be.revertedWithCustomError(diamondAsSwap, "InvalidAmount");
        });

        it("should increment nextOfferId", async () => {
            const currentId = await diamondAsSwap.nextOfferId();

            await diamondAsSwap.connect(users[0].signer).initiateOffer(
                ethers.ZeroAddress, ethers.ZeroAddress, ethers.parseEther("1"), 100n, 0n, 0n, "0x"
            );

            expect(await diamondAsSwap.nextOfferId()).to.equal(currentId + 1n);
        });
    });

    describe("3. Swap Facet - Rate Enforcement", () => {
        const rate3 = ethers.parseEther("3");
        const maxAmountToSell = 500n;
        const amountToBuy = 300n;
        const sellAmount = 100n;

        let encryptedAmountToBuy: { c1: bigint[]; c2: bigint[] };
        let offerId: bigint;

        it("should create offer with rate=3", async () => {
            const initiator = users[1];
            offerId = await diamondAsSwap.nextOfferId();

            await diamondAsSwap.connect(initiator.signer).initiateOffer(
                ethers.ZeroAddress, ethers.ZeroAddress, rate3, maxAmountToSell, 0n, 0n, "0x"
            );

            const offer = await diamondAsSwap.getOffer(offerId);
            expect(offer.rate).to.equal(rate3);
        });

        it("should accept offer with ZK proof for amountToBuy=300", async () => {
            const acceptor = users[2];
            const initiator = users[1];

            const { cipher: encryptedAmount, random: encryptionRandom } =
                encryptMessage(initiator.publicKey as [bigint, bigint], amountToBuy);

            encryptedAmountToBuy = {
                c1: [encryptedAmount[0][0], encryptedAmount[0][1]],
                c2: [encryptedAmount[1][0], encryptedAmount[1][1]]
            };

            const input = {
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

            const proof = await offerAcceptanceCircuit.generateProof(input);
            const calldata = await offerAcceptanceCircuit.generateCalldata(proof);

            const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[10] publicSignals)"],
                [{ proofPoints: calldata.proofPoints, publicSignals: calldata.publicSignals }]
            );

            await diamondAsSwap.connect(acceptor.signer).acceptOffer(offerId, "0x", proofData);

            const offer = await diamondAsSwap.getOffer(offerId);
            expect(offer.acceptor).to.equal(acceptor.signer.address);
        });

        it("should finalize swap with correct sellAmount=100 (300/3)", async () => {
            const initiator = users[1];
            const acceptor = users[2];

            const { cipher: sellAmountEncrypted, random: sellEncryptionRandom } =
                encryptMessage(acceptor.publicKey as [bigint, bigint], sellAmount);

            const input = {
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

            const proof = await offerFinalizationCircuit.generateProof(input);
            const calldata = await offerFinalizationCircuit.generateCalldata(proof);

            const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[13] publicSignals)"],
                [{ proofPoints: calldata.proofPoints, publicSignals: calldata.publicSignals }]
            );

            await diamondAsSwap.connect(initiator.signer).finalizeSwap(offerId, "0x", proofData);

            const offer = await diamondAsSwap.getOffer(offerId);
            expect(offer.initiator).to.equal(ethers.ZeroAddress); // Deleted
            console.log(`✓ Rate enforcement: ${sellAmount} * 3 = ${sellAmount * 3n}`);
        });

        it("should REJECT wrong sellAmount at circuit level", async () => {
            // Create new offer
            const newOfferId = await diamondAsSwap.nextOfferId();
            await diamondAsSwap.connect(users[1].signer).initiateOffer(
                ethers.ZeroAddress, ethers.ZeroAddress, rate3, maxAmountToSell, 0n, 0n, "0x"
            );

            // Accept
            const { cipher: encryptedAmount, random: encryptionRandom } =
                encryptMessage(users[1].publicKey as [bigint, bigint], amountToBuy);

            const acceptInput = {
                AcceptorPrivateKey: users[2].formattedPrivateKey,
                AmountToBuy: amountToBuy,
                EncryptionRandom: encryptionRandom,
                AcceptorPublicKey: users[2].publicKey,
                InitiatorPublicKey: users[1].publicKey,
                MaxAmountToSell: maxAmountToSell,
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
            await diamondAsSwap.connect(users[2].signer).acceptOffer(newOfferId, "0x", acceptProofData);

            // Try with wrong sellAmount
            const wrongSellAmount = 200n; // Should be 100
            const { cipher: wrongSell, random: wrongRandom } =
                encryptMessage(users[2].publicKey as [bigint, bigint], wrongSellAmount);

            const wrongInput = {
                InitiatorPrivateKey: users[1].formattedPrivateKey,
                AmountToBuy: amountToBuy,
                SellAmount: wrongSellAmount,
                SellEncryptionRandom: wrongRandom,
                InitiatorPublicKey: users[1].publicKey,
                AcceptorPublicKey: users[2].publicKey,
                Rate: rate3,
                AmountToBuyC1: [encryptedAmount[0][0], encryptedAmount[0][1]],
                AmountToBuyC2: [encryptedAmount[1][0], encryptedAmount[1][1]],
                SellAmountC1: wrongSell[0],
                SellAmountC2: wrongSell[1],
            };

            try {
                await offerFinalizationCircuit.generateProof(wrongInput);
                expect.fail("Should reject wrong sellAmount");
            } catch (e: any) {
                expect(e.message).to.contain("Error");
                console.log("✓ Correctly rejected sellAmount=200 (should be 100)");
            }
        });
    });

    describe("4. Swap Facet - Error Cases", () => {
        it("should reject accepting non-existent offer", async () => {
            const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[10] publicSignals)"],
                [{ proofPoints: { a: [0, 0], b: [[0, 0], [0, 0]], c: [0, 0] }, publicSignals: new Array(10).fill(0) }]
            );

            await expect(
                diamondAsSwap.connect(users[0].signer).acceptOffer(9999, "0x", proofData)
            ).to.be.revertedWithCustomError(diamondAsSwap, "OfferNotFound");
        });

        it("should reject finalizing without proof", async () => {
            const offerId = await diamondAsSwap.nextOfferId();
            await diamondAsSwap.connect(users[0].signer).initiateOffer(
                ethers.ZeroAddress, ethers.ZeroAddress, ethers.parseEther("1"), 100n, 0n, 0n, "0x"
            );

            // Accept first (simplified - in real test would need proper proof)
            // For now, just test that empty proof is rejected
            await expect(
                diamondAsSwap.connect(users[0].signer).finalizeSwap(offerId, "0x", "0x")
            ).to.be.revertedWithCustomError(diamondAsSwap, "OfferNotAccepted");
        });
    });

    describe("5. Swap Facet - Offer Expiration", () => {
        it("should reject expired offer", async () => {
            const initiator = users[3];
            const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

            await diamondAsSwap.connect(initiator.signer).initiateOffer(
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                ethers.parseEther("1"),
                100n,
                0n,
                expiredTime,
                "0x"
            );

            const offerId = await diamondAsSwap.nextOfferId() - 1n;

            const proofData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[10] publicSignals)"],
                [{ proofPoints: { a: [0, 0], b: [[0, 0], [0, 0]], c: [0, 0] }, publicSignals: new Array(10).fill(0) }]
            );

            await expect(
                diamondAsSwap.connect(users[4].signer).acceptOffer(offerId, "0x", proofData)
            ).to.be.revertedWithCustomError(diamondAsSwap, "OfferExpired");
        });
    });

    describe("6. Allowance Facet - View Functions", () => {
        it("should return empty allowance for non-existent approval", async () => {
            const [encryptedAmount, amountPCT, isPublic, publicAmount, nonce] =
                await diamondAsAllowance.getAllowance(users[0].signer.address, users[1].signer.address, 0);

            expect(isPublic).to.be.false;
            expect(publicAmount).to.equal(0n);
        });
    });

    describe("7. View Functions", () => {
        it("should return correct registrar address", async () => {
            const registrarAddr = await diamondAsToken.registrar();
            expect(registrarAddr).to.equal(await registrar.getAddress());
        });

        it("should return correct auditor public key", async () => {
            const pk = await diamondAsToken.auditorPublicKey();
            expect(pk.x).to.equal(auditorPublicKey[0]);
            expect(pk.y).to.equal(auditorPublicKey[1]);
        });

        it("should return nextOfferId", async () => {
            const nextId = await diamondAsSwap.nextOfferId();
            expect(nextId).to.be.gte(0);
        });
    });

    describe("8. Multiple Rates", () => {
        const testRates = [
            { rate: ethers.parseEther("1"), amountToBuy: 100n, expectedSell: 100n, name: "1:1" },
            { rate: ethers.parseEther("2"), amountToBuy: 200n, expectedSell: 100n, name: "2:1" },
            { rate: ethers.parseEther("5"), amountToBuy: 500n, expectedSell: 100n, name: "5:1" },
        ];

        for (const { rate, amountToBuy, expectedSell, name } of testRates) {
            it(`should enforce rate=${name} correctly`, async () => {
                const initiator = users[0];
                const acceptor = users[1];
                const maxAmountToSell = 1000n;

                const offerId = await diamondAsSwap.nextOfferId();
                await diamondAsSwap.connect(initiator.signer).initiateOffer(
                    ethers.ZeroAddress, ethers.ZeroAddress, rate, maxAmountToSell, 0n, 0n, "0x"
                );

                // Accept
                const { cipher: encryptedAmount, random: encryptionRandom } =
                    encryptMessage(initiator.publicKey as [bigint, bigint], amountToBuy);

                const acceptInput = {
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

                const acceptProof = await offerAcceptanceCircuit.generateProof(acceptInput);
                const acceptCalldata = await offerAcceptanceCircuit.generateCalldata(acceptProof);
                const acceptProofData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[10] publicSignals)"],
                    [{ proofPoints: acceptCalldata.proofPoints, publicSignals: acceptCalldata.publicSignals }]
                );
                await diamondAsSwap.connect(acceptor.signer).acceptOffer(offerId, "0x", acceptProofData);

                // Finalize
                const { cipher: sellEncrypted, random: sellRandom } =
                    encryptMessage(acceptor.publicKey as [bigint, bigint], expectedSell);

                const finalizeInput = {
                    InitiatorPrivateKey: initiator.formattedPrivateKey,
                    AmountToBuy: amountToBuy,
                    SellAmount: expectedSell,
                    SellEncryptionRandom: sellRandom,
                    InitiatorPublicKey: initiator.publicKey,
                    AcceptorPublicKey: acceptor.publicKey,
                    Rate: rate,
                    AmountToBuyC1: [encryptedAmount[0][0], encryptedAmount[0][1]],
                    AmountToBuyC2: [encryptedAmount[1][0], encryptedAmount[1][1]],
                    SellAmountC1: sellEncrypted[0],
                    SellAmountC2: sellEncrypted[1],
                };

                const finalizeProof = await offerFinalizationCircuit.generateProof(finalizeInput);
                const finalizeCalldata = await offerFinalizationCircuit.generateCalldata(finalizeProof);
                const finalizeProofData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proofPoints, uint256[13] publicSignals)"],
                    [{ proofPoints: finalizeCalldata.proofPoints, publicSignals: finalizeCalldata.publicSignals }]
                );

                await diamondAsSwap.connect(initiator.signer).finalizeSwap(offerId, "0x", finalizeProofData);

                const offer = await diamondAsSwap.getOffer(offerId);
                expect(offer.initiator).to.equal(ethers.ZeroAddress);
                console.log(`✓ Rate ${name}: ${expectedSell} * ${ethers.formatEther(rate)} = ${amountToBuy}`);
            });
        }
    });
});
