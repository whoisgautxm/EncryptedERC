import { useState } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import { useZexStore } from '../store';
import styles from './MyOffers.module.css';

type Tab = 'created' | 'accepted' | 'completed';

export default function MyOffers() {
    const { address, isConnected } = useAccount();
    const { isRegistered } = useZexStore();
    const [activeTab, setActiveTab] = useState<Tab>('created');

    if (!isConnected) {
        return (
            <div className="container">
                <div className={styles.notConnected}>
                    <h2>Connect Wallet</h2>
                    <p className="text-muted">
                        Please connect your wallet to view your offers.
                    </p>
                </div>
            </div>
        );
    }

    if (!isRegistered) {
        return (
            <div className="container">
                <div className={styles.notConnected}>
                    <h2>Registration Required</h2>
                    <p className="text-muted">
                        You need to register before you can create or accept offers.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="container">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <div className={styles.header}>
                    <h1 className={styles.title}>My Offers</h1>
                    <p className="text-muted">
                        Manage your swap offers and pending transactions
                    </p>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'created' ? styles.active : ''}`}
                        onClick={() => setActiveTab('created')}
                    >
                        Offers I Created
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'accepted' ? styles.active : ''}`}
                        onClick={() => setActiveTab('accepted')}
                    >
                        Offers I Accepted
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'completed' ? styles.active : ''}`}
                        onClick={() => setActiveTab('completed')}
                    >
                        Completed Swaps
                    </button>
                </div>

                {/* Content */}
                <div className={`glass-card ${styles.content}`}>
                    {activeTab === 'created' && (
                        <div className={styles.empty}>
                            <p>📋</p>
                            <h3>No Offers Created</h3>
                            <p className="text-muted">
                                You haven't created any swap offers yet.
                            </p>
                        </div>
                    )}

                    {activeTab === 'accepted' && (
                        <div className={styles.empty}>
                            <p>🤝</p>
                            <h3>No Pending Swaps</h3>
                            <p className="text-muted">
                                You don't have any offers waiting for finalization.
                            </p>
                        </div>
                    )}

                    {activeTab === 'completed' && (
                        <div className={styles.empty}>
                            <p>✅</p>
                            <h3>No Completed Swaps</h3>
                            <p className="text-muted">
                                Your completed swaps will appear here.
                            </p>
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className={styles.info}>
                    <div className={`glass-card ${styles.infoCard}`}>
                        <h4>💡 How to Finalize a Swap</h4>
                        <p className="text-muted text-sm">
                            After an offer is accepted, either party can finalize the swap.
                            This requires generating a ZK proof to verify the amounts and complete
                            the encrypted token transfers.
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
