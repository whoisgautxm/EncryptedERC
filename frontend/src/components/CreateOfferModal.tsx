import { useState } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useInitiateOffer } from '../hooks';
import { CONTRACTS } from '../constants';
import styles from './CreateOfferModal.module.css';

interface Props {
    onClose: () => void;
}

export default function CreateOfferModal({ onClose }: Props) {
    const { address } = useAccount();
    const { initiateOffer, isPending, isConfirming, isSuccess, error } =
        useInitiateOffer(CONTRACTS.DIAMOND_PROXY as `0x${string}`);

    const [formData, setFormData] = useState({
        assetSell: '',
        assetBuy: '',
        rate: '',
        maxAmount: '',
        minAmount: '0',
        expiresIn: '0', // 0 = no expiry
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.assetSell || !formData.assetBuy || !formData.rate || !formData.maxAmount) {
            toast.error('Please fill in all required fields');
            return;
        }

        try {
            const expiresAt = formData.expiresIn === '0'
                ? 0n
                : BigInt(Math.floor(Date.now() / 1000) + parseInt(formData.expiresIn) * 3600);

            await initiateOffer({
                assetBuy: formData.assetBuy as `0x${string}`,
                assetSell: formData.assetSell as `0x${string}`,
                rate: BigInt(formData.rate),
                maxAmountToSell: BigInt(formData.maxAmount),
                minAmountToSell: BigInt(formData.minAmount || '0'),
                expiresAt,
                approveData: '0x',
            });
        } catch (err) {
            console.error('Failed to create offer:', err);
            toast.error('Failed to create offer');
        }
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
                        <h2>Offer Created!</h2>
                        <p className="text-muted">
                            Your offer is now live on the orderbook.
                        </p>
                        <button className="btn btn-primary" onClick={onClose}>
                            View Orderbook
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
                    <h2>Create Swap Offer</h2>
                    <button className={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGroup}>
                        <label className="label">Token to Sell (Address) *</label>
                        <input
                            type="text"
                            className="input"
                            placeholder="0x..."
                            value={formData.assetSell}
                            onChange={(e) => setFormData({ ...formData, assetSell: e.target.value })}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className="label">Token to Buy (Address) *</label>
                        <input
                            type="text"
                            className="input"
                            placeholder="0x..."
                            value={formData.assetBuy}
                            onChange={(e) => setFormData({ ...formData, assetBuy: e.target.value })}
                        />
                    </div>

                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className="label">Exchange Rate *</label>
                            <input
                                type="number"
                                className="input"
                                placeholder="1"
                                min="1"
                                value={formData.rate}
                                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                            />
                            <span className="text-muted text-sm">
                                For each 1 unit you sell, you receive {formData.rate || '?'} units
                            </span>
                        </div>
                    </div>

                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className="label">Max Amount to Sell *</label>
                            <input
                                type="number"
                                className="input"
                                placeholder="1000"
                                min="1"
                                value={formData.maxAmount}
                                onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value })}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className="label">Min Amount (Optional)</label>
                            <input
                                type="number"
                                className="input"
                                placeholder="0"
                                min="0"
                                value={formData.minAmount}
                                onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className="label">Expires In (Hours)</label>
                        <select
                            className="input"
                            value={formData.expiresIn}
                            onChange={(e) => setFormData({ ...formData, expiresIn: e.target.value })}
                        >
                            <option value="0">Never</option>
                            <option value="1">1 hour</option>
                            <option value="24">24 hours</option>
                            <option value="168">1 week</option>
                        </select>
                    </div>

                    {error && (
                        <div className={styles.error}>
                            {error.message}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isPending || isConfirming}
                    >
                        {isPending ? 'Confirm in Wallet...' : isConfirming ? 'Creating...' : 'Create Offer'}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}
