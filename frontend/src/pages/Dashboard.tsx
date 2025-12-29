import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useZexStore } from '../store';
import styles from './Dashboard.module.css';

export default function Dashboard() {
    const { isConnected, address } = useAccount();
    const { isRegistered } = useZexStore();

    return (
        <div className="container">
            {/* Hero Section */}
            <motion.section
                className={styles.hero}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <h1 className={styles.title}>
                    <span className="gradient-text">Confidential</span> Token Swaps
                </h1>
                <p className={styles.subtitle}>
                    Trade tokens privately using zero-knowledge proofs.
                    Your balances and trade amounts remain encrypted on-chain.
                </p>

                {!isConnected && (
                    <div className={styles.connectCta}>
                        <ConnectButton />
                    </div>
                )}
            </motion.section>

            {/* Status Cards */}
            {isConnected && (
                <motion.section
                    className={styles.statusGrid}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                >
                    <div className={`glass-card ${styles.statusCard}`}>
                        <div className={styles.statusIcon}>👛</div>
                        <div className={styles.statusInfo}>
                            <span className="text-muted text-sm">Connected Wallet</span>
                            <span className={styles.statusValue}>
                                {address?.slice(0, 6)}...{address?.slice(-4)}
                            </span>
                        </div>
                        <span className="badge badge-success">Connected</span>
                    </div>

                    <div className={`glass-card ${styles.statusCard}`}>
                        <div className={styles.statusIcon}>🔐</div>
                        <div className={styles.statusInfo}>
                            <span className="text-muted text-sm">Registration Status</span>
                            <span className={styles.statusValue}>
                                {isRegistered ? 'Registered' : 'Not Registered'}
                            </span>
                        </div>
                        <span className={`badge ${isRegistered ? 'badge-success' : 'badge-warning'}`}>
                            {isRegistered ? '✓ Active' : '⚠ Required'}
                        </span>
                    </div>

                    <div className={`glass-card ${styles.statusCard}`}>
                        <div className={styles.statusIcon}>💰</div>
                        <div className={styles.statusInfo}>
                            <span className="text-muted text-sm">Encrypted Balances</span>
                            <span className={styles.statusValue}>Hidden On-chain</span>
                        </div>
                        <span className="badge badge-info">🔒 Private</span>
                    </div>
                </motion.section>
            )}

            {/* Quick Actions */}
            <motion.section
                className={styles.actionsSection}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
            >
                <h2 className={styles.sectionTitle}>Quick Actions</h2>

                <div className={styles.actionsGrid}>
                    <Link to="/orderbook" className={`glass-card ${styles.actionCard}`}>
                        <div className={styles.actionIcon}>📊</div>
                        <h3>View Orderbook</h3>
                        <p className="text-muted text-sm">
                            Browse available swap offers and find the best rates.
                        </p>
                    </Link>

                    <Link to="/orderbook?create=true" className={`glass-card ${styles.actionCard}`}>
                        <div className={styles.actionIcon}>➕</div>
                        <h3>Create Offer</h3>
                        <p className="text-muted text-sm">
                            List tokens you want to sell and set your terms.
                        </p>
                    </Link>

                    <Link to="/my-offers" className={`glass-card ${styles.actionCard}`}>
                        <div className={styles.actionIcon}>📋</div>
                        <h3>My Offers</h3>
                        <p className="text-muted text-sm">
                            Manage your active offers and pending swaps.
                        </p>
                    </Link>
                </div>
            </motion.section>

            {/* How It Works */}
            <motion.section
                className={styles.howItWorks}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
            >
                <h2 className={styles.sectionTitle}>How ZEX Works</h2>

                <div className={styles.stepsGrid}>
                    <div className={styles.stepCard}>
                        <div className={styles.stepNumber}>1</div>
                        <h4>Register</h4>
                        <p className="text-muted text-sm">
                            Generate cryptographic keys and create a ZK proof to register on-chain.
                        </p>
                    </div>

                    <div className={styles.stepCard}>
                        <div className={styles.stepNumber}>2</div>
                        <h4>Create or Accept</h4>
                        <p className="text-muted text-sm">
                            Create swap offers or accept existing ones from the orderbook.
                        </p>
                    </div>

                    <div className={styles.stepCard}>
                        <div className={styles.stepNumber}>3</div>
                        <h4>ZK Proof</h4>
                        <p className="text-muted text-sm">
                            Generate proofs to verify amounts without revealing them.
                        </p>
                    </div>

                    <div className={styles.stepCard}>
                        <div className={styles.stepNumber}>4</div>
                        <h4>Finalize</h4>
                        <p className="text-muted text-sm">
                            Complete the swap with encrypted token transfers.
                        </p>
                    </div>
                </div>
            </motion.section>
        </div>
    );
}
