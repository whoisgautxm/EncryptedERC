<div align="center">

<img src="images/banner.png">

# ZEX: Confidential Peer-to-Peer DEX

**A Zero-Knowledge Decentralized Exchange with Fully Private Order Book Trading**

[![Deployed on Mantle](https://img.shields.io/badge/Deployed-Mantle%20Sepolia-blue)](https://sepolia.mantlescan.xyz/)
[![ZK Proofs](https://img.shields.io/badge/ZK-Groth16-purple)](https://docs.circom.io/)
[![Diamond Standard](https://img.shields.io/badge/EIP-2535%20Diamond-orange)](https://eips.ethereum.org/EIPS/eip-2535)
[![License](https://img.shields.io/badge/License-Ecosystem-green)](LICENSE.md)

</div>

---

## 📖 What is ZEX?

**ZEX (Zero-Knowledge Exchange)** is a trustless peer-to-peer decentralized exchange protocol that enables **confidential token swaps** using zero-knowledge proofs. Inspired by the research paper ["ZEX: Confidential Peer-to-Peer DEX"](ZEX_confidential_peer_to_peer_DEX.pdf), this implementation brings private order book trading to EVM blockchains.

### 🔐 Core Innovation: Privacy-Preserving Swaps

Unlike traditional DEXs where order amounts are visible to everyone, ZEX:

1. **Hides transaction amounts** - Only the parties involved can see the actual values
2. **Enforces exchange rates via ZK proofs** - Mathematical guarantees without revealing amounts
3. **Supports encrypted balances** - User balances are stored encrypted on-chain
4. **Maintains auditor compliance** - A designated auditor can decrypt transactions for regulatory purposes

### How It Works

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        ZEX SWAP FLOW                                       │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  1️⃣  ALICE creates offer:                                                  │
│      "I'll sell Token A at rate 3:1 for Token B"                           │
│      (rate is public, max amount is public)                                │
│                                                                            │
│  2️⃣  BOB accepts with ZK proof:                                            │
│      - Encrypts amountToBuy with Alice's public key                        │
│      - Proves: amountToBuy ≤ maxAmount × rate                              │
│      - Does NOT reveal actual amount!                                      │
│                                                                            │
│  3️⃣  ALICE finalizes with ZK proof (RATE ENFORCEMENT):                     │
│      - Proves: sellAmount × rate = amountToBuy                             │
│      - Proves she decrypted Bob's commitment correctly                     │
│      - Settlement happens with encrypted amounts                           │
│                                                                            │
│  ✅ RESULT: Swap completes, no one knows the amounts except parties        │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture

### Why EIP-2535 Diamond Standard?

The ZEX protocol is implemented using the **Diamond Pattern (EIP-2535)** for several critical reasons:

| Challenge | Diamond Solution |
|-----------|------------------|
| **Contract Size Limit** | Solidity contracts have a 24KB deployment limit. ZEX's full functionality exceeds this. Diamonds split logic into facets. |
| **Upgradeability** | Facets can be upgraded independently without migrating user data or redeploying the entire system. |
| **Shared Storage** | All facets share a single storage slot (`AppStorage`), ensuring consistent state across functions. |
| **Gas Efficiency** | Single proxy address = users interact with one contract. Storage is shared, not duplicated. |
| **Modularity** | Token operations, allowances, and swaps are cleanly separated into focused facets. |

### Diamond Structure

```
                    ┌─────────────────────────────┐
                    │       ZexDiamond            │
                    │   (EIP-2535 Proxy)          │
                    │                             │
                    │  fallback() → delegatecall  │
                    └──────────────┬──────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│   ZexTokenFacet     │ │  ZexAllowanceFacet  │ │    ZexSwapFacet     │
├─────────────────────┤ ├─────────────────────┤ ├─────────────────────┤
│ • name(), symbol()  │ │ • approve()         │ │ • initiateOffer()   │
│ • decimals()        │ │ • getAllowance()    │ │ • acceptOffer()     │
│ • privateMint()     │ │ • confidentialAppr  │ │ • finalizeSwap()    │
│ • privateTransfer() │ │   ove()             │ │ • getOffer()        │
│ • privateBurn()     │ │ • cancelAllowance() │ │                     │
│ • balanceOf()       │ │ • transferFrom()    │ │                     │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
           │                       │                       │
           └───────────────────────┴───────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │       LibAppStorage         │
                    │    (Shared Diamond State)   │
                    ├─────────────────────────────┤
                    │ • Token metadata            │
                    │ • Encrypted balances        │
                    │ • Encrypted allowances      │
                    │ • Swap offers               │
                    │ • Verifier references       │
                    │ • Auditor public key        │
                    └─────────────────────────────┘
```

### Contract Files

| Contract | Purpose |
|----------|---------|
| [`ZexDiamond.sol`](contracts/diamond/ZexDiamond.sol) | Main proxy contract, routes calls to facets |
| [`LibDiamond.sol`](contracts/diamond/LibDiamond.sol) | Diamond cut logic, facet management |
| [`LibAppStorage.sol`](contracts/diamond/LibAppStorage.sol) | Shared storage struct for all facets |
| [`ZexTokenFacet.sol`](contracts/facets/ZexTokenFacet.sol) | Token operations (mint, burn, transfer) |
| [`ZexAllowanceFacet.sol`](contracts/facets/ZexAllowanceFacet.sol) | Encrypted allowances and approvals |
| [`ZexSwapFacet.sol`](contracts/facets/ZexSwapFacet.sol) | Order book and swap marketplace |
| [`Registrar.sol`](contracts/Registrar.sol) | User registration with ZK proofs |

---

## 🔮 Zero-Knowledge Circuits

ZEX uses **10 ZK circuits** implemented in Circom, each serving a specific purpose:

### Core Token Circuits

| Circuit | Public Signals | Purpose |
|---------|----------------|---------|
| [`registration.circom`](circom/registration.circom) | ChainID, PublicKey, Address | Prove ownership of private key without revealing it |
| [`mint.circom`](circom/mint.circom) | Encrypted amount, Auditor encryption | Privately mint tokens with auditor visibility |
| [`transfer.circom`](circom/transfer.circom) | Encrypted amounts for sender/receiver | Private token transfers |
| [`withdraw.circom`](circom/withdraw.circom) | Amount, Balance proof | Convert private to public tokens |
| [`burn.circom`](circom/burn.circom) | Amount, Balance proof | Destroy private tokens |

### Allowance Circuits

| Circuit | Public Signals | Purpose |
|---------|----------------|---------|
| [`confidential_approve.circom`](circom/confidential_approve.circom) | Encrypted allowance | Approve spender with hidden amount |
| [`confidential_transfer_from.circom`](circom/confidential_transfer_from.circom) | Encrypted transfer data | Execute approved transfer |
| [`cancel_allowance.circom`](circom/cancel_allowance.circom) | Nullifier | Revoke an allowance |

### DEX Circuits (ZEX-Specific)

| Circuit | Public Signals | Purpose |
|---------|----------------|---------|
| [`offer_acceptance.circom`](circom/offer_acceptance.circom) | AcceptorPK, InitiatorPK, MaxAmount, Rate, EncryptedAmount | Accept swap offer with amount bounds validation |
| [`offer_finalization.circom`](circom/offer_finalization.circom) | InitiatorPK, AcceptorPK, Rate, Commitments, EncryptedSellAmount | **Rate enforcement**: proves `sellAmount × rate = amountToBuy` |

### Critical: Rate Enforcement Circuit

The `offer_finalization.circom` circuit is the **heart of ZEX's trustless guarantees**:

```circom
// This constraint enforces: sellAmount * rate = amountToBuy
// Without revealing either sellAmount or amountToBuy!
component rateEnforce = IsZero();
rateEnforce.in <== SellAmount * Rate - AmountToBuy;
signal rateValid <== rateEnforce.out;
rateValid === 1;
```

This means:
- If Alice offers rate 3:1 and Bob commits to pay 300 tokens
- Alice MUST prove she's selling exactly 100 tokens (300 ÷ 3)
- The circuit mathematically enforces this without revealing 100 or 300

---

## 📊 Deployed Contracts (Mantle Sepolia)

| Contract | Address |
|----------|---------|
| 💎 **ZexDiamond** | [`0x4caD62E2E3618C64B20c9a0636D129fE6eDDB591`](https://sepolia.mantlescan.xyz/address/0x4caD62E2E3618C64B20c9a0636D129fE6eDDB591) |
| 📝 **Registrar** | [`0x925fB09b836aBfFE0c42b91A1D1B8d254e787fcb`](https://sepolia.mantlescan.xyz/address/0x925fB09b836aBfFE0c42b91A1D1B8d254e787fcb) |
| 🔐 **OfferAcceptanceVerifier** | [`0x6D5984ed8e314c86fcb441E5F57535010e5c3d93`](https://sepolia.mantlescan.xyz/address/0x6D5984ed8e314c86fcb441E5F57535010e5c3d93) |
| ✅ **OfferFinalizationVerifier** | [`0xAF91e7A090758DC8DDA965Ae99580a06844A9634`](https://sepolia.mantlescan.xyz/address/0xAF91e7A090758DC8DDA965Ae99580a06844A9634) |

> **All 17 contracts verified on Mantlescan** ✅

---

## 🧪 End-to-End Testing

Since this is a hackathon project, there is no frontend. Instead, we provide comprehensive **E2E test scripts** that demonstrate the full protocol functionality.

### Available Scripts

| Script | Purpose |
|--------|---------|
| [`deploy-mantle.ts`](scripts/deploy-mantle.ts) | Deploy all 17 contracts to Mantle L2 |
| [`verify-contracts.ts`](scripts/verify-contracts.ts) | Verify contracts on block explorer |
| [`test-live.ts`](scripts/test-live.ts) | Basic integration tests on deployed contracts |
| [`test-full-swap.ts`](scripts/test-full-swap.ts) | **Complete two-user swap E2E test** |

### Running the Full Swap Test

```bash
# 1. Set up environment
cp .env.example .env
# Add PRIVATE_KEY and PRIVATE_KEY_2 (two wallets for two users)

# 2. Deploy to Mantle Sepolia
npx hardhat run scripts/deploy-mantle.ts --network mantleSepolia

# 3. Run full two-user swap test
npx hardhat run scripts/test-full-swap.ts --network mantleSepolia
```

### What the E2E Test Does

```
╔════════════════════════════════════════════════════════════════╗
║       ZEX Diamond Full Two-User Swap E2E Test                  ║
╚════════════════════════════════════════════════════════════════╝

📋 STEP 1: Setup Auditor Key
   ✓ Auditor key set

📋 STEP 2: Register Both Users
   ✓ Alice registered with ZK proof
   ✓ Bob registered with ZK proof

📋 STEP 3: Alice Creates Swap Offer
   Rate: 3:1 (sell 1 Token A, receive 3 Token B)
   ✓ Offer created

📋 STEP 4: Bob Accepts the Offer (ZK Proof)
   🔒 Encrypting amount with Alice's public key
   🔐 Generating ZK proof for offer acceptance
   ✓ Offer accepted

📋 STEP 5: Alice Finalizes the Swap (ZK Proof + Rate Enforcement)
   📊 What the ZK proof proves:
      • sellAmount × rate = amountToBuy
      • 100 × 3 = 300 ✓
   ✓ Swap finalized

✅ All ZK proofs verified on-chain!
```

---

## 🛠️ Development Setup

### Prerequisites

- Node.js ≥ v22.x
- Circom ≥ 2.1.9

### Installation

```bash
# Clone the repo
git clone https://github.com/ava-labs/EncryptedERC.git
cd EncryptedERC

# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Compile ZK circuits (takes ~5 minutes)
npx hardhat zkit make --force
npx hardhat zkit verifiers

# Run tests
npx hardhat test
```

### Environment Variables

```bash
# .env file
PRIVATE_KEY=your_deployer_private_key
PRIVATE_KEY_2=second_wallet_for_e2e_tests
MANTLE_TESTNET_RPC_URL=https://rpc.sepolia.mantle.xyz
MANTLESCAN_API_KEY=your_mantlescan_api_key
```

---

## 📐 Technical Deep Dive

### Encryption Scheme

ZEX uses **ElGamal encryption** on the **BabyJubJub curve**:

- **Curve**: BabyJubJub (embedded in BN254, SNARK-friendly)
- **Encryption**: Exponential ElGamal for additive homomorphism
- **Key Format**: (x, y) curve points for public keys

```solidity
struct EGCT {
    Point c1;  // ElGamal ciphertext component 1
    Point c2;  // ElGamal ciphertext component 2
}
```

### Balance Storage

Encrypted balances are stored as:

```solidity
struct EncryptedBalance {
    EGCT egct;           // Encrypted balance
    uint256 nonce;       // Replay protection
    uint256 txIndex;     // Transaction ordering
}
```

### Swap Offer Structure

```solidity
struct Offer {
    address initiator;
    address acceptor;
    address assetBuy;
    address assetSell;
    uint256 rate;          // Public exchange rate
    uint256 maxAmountToSell;
    uint256 minAmountToSell;
    uint256 expiresAt;
    bytes amountToBuyEncryptionData;  // Encrypted by acceptor
    bytes amountToBuyCommitmentData;
    bytes initiatorApproveData;
}
```

---

## 📚 Research Background

This implementation is based on the research paper:

> **"ZEX: Confidential Peer-to-Peer DEX"**
> 
> The paper introduces a novel approach to decentralized exchanges that:
> - Maintains order privacy on a public blockchain
> - Uses zero-knowledge proofs for rate enforcement
> - Supports encrypted order matching
> - Provides auditor compliance capabilities

See the full paper: [ZEX_confidential_peer_to_peer_DEX.pdf](ZEX_confidential_peer_to_peer_DEX.pdf)

---

## 🔒 Security Considerations

- **Auditor Integration**: Built-in auditor functionality for regulatory compliance
- **Rate Enforcement**: Mathematically enforced via ZK circuits, not trusted parties
- **Key Persistence**: User keys are stored in `deployments/user-keys-{chainId}.json` for test continuity
- **Trusted Setup**: Production verifiers use secure trusted setups from zkEVM

---

## 📄 License

This project is licensed under the Ecosystem License - see [LICENSE.md](LICENSE.md) for details.

---

<div align="center">

**Built for Hackathon** 🏆

*Bringing private trading to public blockchains*

</div>
