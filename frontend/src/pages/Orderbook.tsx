import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import { useZexStore } from '../store';
import { useNextOfferId, useOffer } from '../hooks';
import { CONTRACTS } from '../constants';
import CreateOfferModal from '../components/CreateOfferModal';
import AcceptOfferModal from '../components/AcceptOfferModal';
import type { OfferWithId } from '../types';
import styles from './Orderbook.module.css';

export default function Orderbook() {
    const { address, isConnected } = useAccount();
    const { isRegistered } = useZexStore();
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedOffer, setSelectedOffer] = useState<OfferWithId | null>(null);
    const [offers, setOffers] = useState<OfferWithId[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Get the next offer ID to know how many offers exist
    const { data: nextOfferId } = useNextOfferId(CONTRACTS.DIAMOND_PROXY as `0x${string}`);

    // Fetch all offers
    useEffect(() => {
        const fetchOffers = async () => {
            if (!nextOfferId || nextOfferId === 0n) {
                setOffers([]);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            // For now, we'll display a placeholder since we can't batch read easily
            // In production, you'd use multicall or a subgraph
            setOffers([]);
            setIsLoading(false);
        };

        fetchOffers();
    }, [nextOfferId]);

    const formatAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const getOfferStatus = (offer: OfferWithId) => {
        if (offer.acceptor !== '0x0000000000000000000000000000000000000000') {
            return 'accepted';
        }
        if (offer.expiresAt > 0n && offer.expiresAt < BigInt(Date.now() / 1000)) {
            return 'expired';
        }
        return 'open';
    };

    return (
        <div className="container">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <h1 className={styles.title}>Orderbook</h1>
                        <p className="text-muted">
                            Browse and accept confidential swap offers
                        </p>
                    </div>

                    {isConnected && isRegistered && (
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowCreateModal(true)}
                        >
                            + Create Offer
                        </button>
                    )}
                </div>

                {/* Filters */}
                <div className={`glass-card ${styles.filters}`}>
                    <div className={styles.filterGroup}>
                        <label className="label">Status</label>
                        <select className="input">
                            <option value="all">All Offers</option>
                            <option value="open">Open Only</option>
                            <option value="accepted">Accepted</option>
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <label className="label">Sort By</label>
                        <select className="input">
                            <option value="newest">Newest First</option>
                            <option value="rate">Best Rate</option>
                            <option value="expiring">Expiring Soon</option>
                        </select>
                    </div>

                    <div className={styles.filterGroup}>
                        <label className="label">Total Offers</label>
                        <span className={styles.offerCount}>
                            {nextOfferId?.toString() || '0'}
                        </span>
                    </div>
                </div>

                {/* Offers Table */}
                <div className={`glass-card ${styles.tableContainer}`}>
                    {isLoading ? (
                        <div className={styles.loading}>
                            <div className="spinner" />
                            <p>Loading orderbook...</p>
                        </div>
                    ) : offers.length === 0 ? (
                        <div className={styles.empty}>
                            <p>📋</p>
                            <h3>No Offers Yet</h3>
                            <p className="text-muted">
                                {Number(nextOfferId || 0) > 0
                                    ? 'Offers will appear here once loaded.'
                                    : 'Be the first to create a swap offer!'
                                }
                            </p>
                            {isConnected && isRegistered && (
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setShowCreateModal(true)}
                                >
                                    Create First Offer
                                </button>
                            )}
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Maker</th>
                                    <th>Selling</th>
                                    <th>Buying</th>
                                    <th>Rate</th>
                                    <th>Max Amount</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {offers.map((offer) => {
                                    const status = getOfferStatus(offer);
                                    const isOwner = offer.initiator.toLowerCase() === address?.toLowerCase();

                                    return (
                                        <tr key={offer.id.toString()}>
                                            <td>#{offer.id.toString()}</td>
                                            <td className={styles.address}>
                                                {formatAddress(offer.initiator)}
                                                {isOwner && <span className="badge badge-info">You</span>}
                                            </td>
                                            <td>{formatAddress(offer.assetSell)}</td>
                                            <td>{formatAddress(offer.assetBuy)}</td>
                                            <td>{offer.rate.toString()}</td>
                                            <td>{offer.maxAmountToSell.toString()}</td>
                                            <td>
                                                <span className={`badge badge-${status === 'open' ? 'success' : status === 'accepted' ? 'info' : 'error'}`}>
                                                    {status}
                                                </span>
                                            </td>
                                            <td>
                                                {status === 'open' && !isOwner && isRegistered && (
                                                    <button
                                                        className="btn btn-secondary"
                                                        onClick={() => setSelectedOffer(offer)}
                                                    >
                                                        Accept
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Note about Diamond Proxy */}
                <div className={styles.note}>
                    <p className="text-muted text-sm">
                        💡 Offers are created on the Diamond Proxy at{' '}
                        <code>{CONTRACTS.DIAMOND_PROXY.slice(0, 10)}...{CONTRACTS.DIAMOND_PROXY.slice(-6)}</code>
                    </p>
                </div>
            </motion.div>

            {/* Modals */}
            {showCreateModal && (
                <CreateOfferModal onClose={() => setShowCreateModal(false)} />
            )}

            {selectedOffer && (
                <AcceptOfferModal
                    offer={selectedOffer}
                    onClose={() => setSelectedOffer(null)}
                />
            )}
        </div>
    );
}
