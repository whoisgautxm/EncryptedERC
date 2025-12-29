import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserKeys, OfferWithId } from '../types';

interface ZexState {
    // User state
    isRegistered: boolean;
    setIsRegistered: (registered: boolean) => void;

    // User keys (stored encrypted, decrypted on init)
    userKeys: UserKeys | null;
    setUserKeys: (keys: UserKeys | null) => void;

    // Registration modal
    showRegistrationModal: boolean;
    setShowRegistrationModal: (show: boolean) => void;

    // Orderbook cache
    offers: OfferWithId[];
    setOffers: (offers: OfferWithId[]) => void;
    addOffer: (offer: OfferWithId) => void;
    updateOffer: (offerId: bigint, update: Partial<OfferWithId>) => void;
    removeOffer: (offerId: bigint) => void;

    // UI state
    isLoadingProof: boolean;
    setIsLoadingProof: (loading: boolean) => void;
    proofProgress: string;
    setProofProgress: (progress: string) => void;
}

export const useZexStore = create<ZexState>()(
    persist(
        (set) => ({
            // User state
            isRegistered: false,
            setIsRegistered: (registered) => set({ isRegistered: registered }),

            // User keys
            userKeys: null,
            setUserKeys: (keys) => set({ userKeys: keys }),

            // Registration modal
            showRegistrationModal: false,
            setShowRegistrationModal: (show) => set({ showRegistrationModal: show }),

            // Orderbook
            offers: [],
            setOffers: (offers) => set({ offers }),
            addOffer: (offer) => set((state) => ({ offers: [...state.offers, offer] })),
            updateOffer: (offerId, update) =>
                set((state) => ({
                    offers: state.offers.map((o) =>
                        o.id === offerId ? { ...o, ...update } : o
                    ),
                })),
            removeOffer: (offerId) =>
                set((state) => ({
                    offers: state.offers.filter((o) => o.id !== offerId),
                })),

            // UI state
            isLoadingProof: false,
            setIsLoadingProof: (loading) => set({ isLoadingProof: loading }),
            proofProgress: '',
            setProofProgress: (progress) => set({ proofProgress: progress }),
        }),
        {
            name: 'zex-storage',
            partialize: (state) => ({
                // Only persist user registration status
                isRegistered: state.isRegistered,
            }),
        }
    )
);

// Separate store for encrypted keys (persisted with wallet address)
interface KeyStore {
    keys: Record<string, string>; // wallet address -> encrypted keys JSON
    saveKeys: (address: string, keys: UserKeys) => void;
    loadKeys: (address: string) => UserKeys | null;
    clearKeys: (address: string) => void;
}

export const useKeyStore = create<KeyStore>()(
    persist(
        (set, get) => ({
            keys: {},
            saveKeys: (address, keys) => {
                const serialized = JSON.stringify({
                    privateKey: keys.privateKey.toString(16),
                    formattedPrivateKey: keys.formattedPrivateKey.toString(16),
                    publicKey: [keys.publicKey[0].toString(16), keys.publicKey[1].toString(16)],
                });
                set((state) => ({
                    keys: { ...state.keys, [address.toLowerCase()]: serialized },
                }));
            },
            loadKeys: (address) => {
                const serialized = get().keys[address.toLowerCase()];
                if (!serialized) return null;
                try {
                    const parsed = JSON.parse(serialized);
                    return {
                        privateKey: BigInt('0x' + parsed.privateKey),
                        formattedPrivateKey: BigInt('0x' + parsed.formattedPrivateKey),
                        publicKey: [
                            BigInt('0x' + parsed.publicKey[0]),
                            BigInt('0x' + parsed.publicKey[1]),
                        ] as [bigint, bigint],
                    };
                } catch {
                    return null;
                }
            },
            clearKeys: (address) => {
                set((state) => {
                    const newKeys = { ...state.keys };
                    delete newKeys[address.toLowerCase()];
                    return { keys: newKeys };
                });
            },
        }),
        {
            name: 'zex-keys',
        }
    )
);
