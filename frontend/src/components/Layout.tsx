import { Outlet, NavLink } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { useEffect } from 'react';
import { useZexStore, useKeyStore } from '../store';
import { useIsRegistered } from '../hooks';
import RegistrationModal from './RegistrationModal';
import styles from './Layout.module.css';

export default function Layout() {
    const { address, isConnected } = useAccount();
    const { data: isRegistered, isLoading: isCheckingRegistration } = useIsRegistered(address);
    const {
        setIsRegistered,
        showRegistrationModal,
        setShowRegistrationModal,
        setUserKeys
    } = useZexStore();
    const { loadKeys } = useKeyStore();

    // Load user keys and check registration on wallet connect
    useEffect(() => {
        if (address) {
            const keys = loadKeys(address);
            if (keys) {
                setUserKeys(keys);
            }
        } else {
            setUserKeys(null);
        }
    }, [address, loadKeys, setUserKeys]);

    // Update registration status
    useEffect(() => {
        if (isRegistered !== undefined) {
            setIsRegistered(isRegistered);
        }
    }, [isRegistered, setIsRegistered]);

    // Show registration modal if connected but not registered
    useEffect(() => {
        if (isConnected && !isCheckingRegistration && isRegistered === false) {
            setShowRegistrationModal(true);
        }
    }, [isConnected, isCheckingRegistration, isRegistered, setShowRegistrationModal]);

    return (
        <div className={styles.layout}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <div className={styles.logo}>
                        <span className="gradient-text">ZEX</span>
                        <span className={styles.logoSub}>Confidential Swap</span>
                    </div>

                    <nav className={styles.nav}>
                        <NavLink
                            to="/"
                            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                        >
                            Dashboard
                        </NavLink>
                        <NavLink
                            to="/orderbook"
                            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                        >
                            Orderbook
                        </NavLink>
                        <NavLink
                            to="/my-offers"
                            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                        >
                            My Offers
                        </NavLink>
                    </nav>

                    <div className={styles.headerRight}>
                        {isConnected && (
                            <div className={styles.registrationStatus}>
                                {isCheckingRegistration ? (
                                    <span className={`badge badge-info ${styles.statusBadge}`}>
                                        <span className="spinner" style={{ width: 12, height: 12 }} />
                                        Checking...
                                    </span>
                                ) : isRegistered ? (
                                    <span className={`badge badge-success ${styles.statusBadge}`}>
                                        ✓ Registered
                                    </span>
                                ) : (
                                    <button
                                        className={`badge badge-warning ${styles.statusBadge}`}
                                        onClick={() => setShowRegistrationModal(true)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        ⚠ Not Registered
                                    </button>
                                )}
                            </div>
                        )}
                        <ConnectButton
                            showBalance={false}
                            chainStatus="icon"
                            accountStatus="address"
                        />
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className={styles.main}>
                <Outlet />
            </main>

            {/* Footer */}
            <footer className={styles.footer}>
                <p className="text-muted text-sm">
                    ZEX Protocol • Confidential Token Swaps on Mantle Sepolia
                </p>
            </footer>

            {/* Registration Modal */}
            {showRegistrationModal && (
                <RegistrationModal onClose={() => setShowRegistrationModal(false)} />
            )}
        </div>
    );
}
