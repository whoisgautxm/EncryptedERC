import { useState } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAcceptOffer, useUserPublicKey } from '../hooks';
import { useZexStore } from '../store';
import { generateOfferAcceptanceProof } from '../lib/proofs';
import { CONTRACTS } from '../constants';
import type { OfferWithId } from '../types';
import styles from './AcceptOfferModal.module.css';

interface Props {
    offer: OfferWithId;
    onClose: () => void;
}

export default function AcceptOfferModal({ offer, onClose }: Props) {
    const { address } = useAccount();
    const { userKeys, setProofProgress, proofProgress } = useZexStore();
    const { acceptOffer, isPending, isConfirming, isSuccess, error } =
        useAcceptOffer(CONTRACTS.DIAMOND_PROXY as `0x${string}`);

    // Get initiator's public key
    const { data: initiatorPK } = useUserPublicKey(offer.initiator);

    const [amount, setAmount] = useState('');
    const [isGeneratingProof, setIsGeneratingProof] = useState(false);

    const formatAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const handleAccept = async () => {
        if (!amount || !userKeys || !initiatorPK) {
            toast.error('Please enter an amount and ensure you are registered');
            return;
        }

        const amountBigInt = BigInt(amount);
        if (amountBigInt > offer.maxAmountToSell) {
            toast.error(`Amount exceeds maximum (${offer.maxAmountToSell.toString()})`);
            return;
        }

        if (offer.minAmountToSell > 0n && amountBigInt < offer.minAmountToSell) {
            toast.error(`Amount below minimum (${offer.minAmountToSell.toString()})`);
            return;
        }

        setIsGeneratingProof(true);
        setProofProgress('Preparing proof inputs...');

        try {
            const proof = await generateOfferAcceptanceProof(
                userKeys.formattedPrivateKey,
                userKeys.publicKey,
                [initiatorPK[0], initiatorPK[1]],
                amountBigInt,
                offer.maxAmountToSell,
                offer.rate,
                (msg) => setProofProgress(msg)
            );

            setProofProgress('Submitting transaction...');
            await acceptOffer(offer.id, proof);

            toast.success('Offer accepted successfully!');
        } catch (err) {
            console.error('Failed to accept offer:', err);
            toast.error('Failed to accept offer. Please try again.');
        } finally {
            setIsGeneratingProof(false);
            setProofProgress('');
        }
    };

    // Quick amount buttons
    const setPercentage = (pct: number) => {
        const amt = (offer.maxAmountToSell * BigInt(pct)) / 100n;
        setAmount(amt.toString());
    };

    if (isSuccess) {
        return (
            <div className="modal-backdrop" onClick={onClose}>
                <motion.div
                    className={`glass-card ${styles.modal}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={styles.success}>
                        <div className={styles.successIcon}>✓</div>
                        <h2>Offer Accepted!</h2>
                        <p className="text-muted">
                            The swap is now pending finalization.
                        </p>
                        <button className="btn btn-primary" onClick={onClose}>
                            View My Offers
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <motion.div
                className={`glass-card ${styles.modal}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.header}>
                    <h2>Accept Offer #{offer.id.toString()}</h2>
                    <button className={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                {/* Offer Details */}
                <div className={styles.details}>
                    <div className={styles.detailRow}>
                        <span className="text-muted">Maker</span>
                        <span className={styles.address}>{formatAddress(offer.initiator)}</span>
                    </div>
                    <div className={styles.detailRow}>
                        <span className="text-muted">Selling Token</span>
                        <span className={styles.address}>{formatAddress(offer.assetSell)}</span>
                    </div>
                    <div className={styles.detailRow}>
                        <span className="text-muted">Buying Token</span>
                        <span className={styles.address}>{formatAddress(offer.assetBuy)}</span>
                    </div>
                    <div className={styles.detailRow}>
                        <span className="text-muted">Rate</span>
                        <span>{offer.rate.toString()}x</span>
                    </div>
                    <div className={styles.detailRow}>
                        <span className="text-muted">Available</span>
                        <span>{offer.maxAmountToSell.toString()}</span>
                    </div>
                </div>

                {/* Amount Input */}
                <div className={styles.amountSection}>
                    <label className="label">Amount to Buy</label>
                    <input
                        type="number"
                        className="input"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={isGeneratingProof || isPending || isConfirming}
                    />

                    <div className={styles.quickAmounts}>
                        <button onClick={() => setPercentage(25)} className="btn btn-ghost">25%</button>
                        <button onClick={() => setPercentage(50)} className="btn btn-ghost">50%</button>
                        <button onClick={() => setPercentage(75)} className="btn btn-ghost">75%</button>
                        <button onClick={() => setPercentage(100)} className="btn btn-ghost">Max</button>
                    </div>

                    {amount && (
                        <p className="text-muted text-sm">
                            You will pay: {(BigInt(amount || '0') * offer.rate).toString()} tokens
                        </p>
                    )}
                </div>

                {/* Proof Generation Status */}
                {isGeneratingProof && (
                    <div className={styles.proofStatus}>
                        <div className="spinner" />
                        <p>{proofProgress}</p>
                    </div>
                )}

                {error && (
                    <div className={styles.error}>
                        {error.message}
                    </div>
                )}

                <button
                    className="btn btn-primary"
                    onClick={handleAccept}
                    disabled={!amount || isGeneratingProof || isPending || isConfirming || !userKeys}
                >
                    {!userKeys
                        ? 'Not Registered'
                        : isGeneratingProof
                            ? 'Generating ZK Proof...'
                            : isPending
                                ? 'Confirm in Wallet...'
                                : isConfirming
                                    ? 'Processing...'
                                    : 'Accept Offer'
                    }
                </button>
            </motion.div>
        </div>
    );
}
