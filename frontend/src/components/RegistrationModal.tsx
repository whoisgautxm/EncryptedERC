import { useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useZexStore, useKeyStore } from '../store';
import { useRegister } from '../hooks';
import { generateKeyPair } from '../lib/crypto';
import { generateRegistrationProof } from '../lib/proofs';
import type { UserKeys } from '../types';
import styles from './RegistrationModal.module.css';

interface Props {
    onClose: () => void;
}

type Step = 'connect' | 'generate' | 'prove' | 'register' | 'complete';

export default function RegistrationModal({ onClose }: Props) {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { setUserKeys, setIsRegistered, setProofProgress, proofProgress } = useZexStore();
    const { saveKeys } = useKeyStore();
    const { register, isPending, isConfirming, isSuccess, error } = useRegister();

    const [step, setStep] = useState<Step>(isConnected ? 'generate' : 'connect');
    const [keys, setKeys] = useState<UserKeys | null>(null);
    const [isGeneratingProof, setIsGeneratingProof] = useState(false);

    const handleGenerateKeys = () => {
        const newKeys = generateKeyPair();
        setKeys(newKeys);
        setStep('prove');
    };

    const handleGenerateProof = async () => {
        if (!keys || !address) return;

        setIsGeneratingProof(true);
        setProofProgress('Initializing...');

        try {
            const proof = await generateRegistrationProof(
                keys.formattedPrivateKey,
                keys.publicKey,
                address,
                BigInt(chainId),
                (msg) => setProofProgress(msg)
            );

            setProofProgress('Submitting transaction...');
            setStep('register');

            await register(proof);
        } catch (err) {
            console.error('Proof generation failed:', err);
            toast.error('Failed to generate proof. Please try again.');
            setProofProgress('');
        } finally {
            setIsGeneratingProof(false);
        }
    };

    // Handle successful registration
    if (isSuccess && keys && address) {
        // Save keys and update state
        saveKeys(address, keys);
        setUserKeys(keys);
        setIsRegistered(true);

        return (
            <div className="modal-backdrop" onClick={onClose}>
                <motion.div
                    className={`glass-card ${styles.modal}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={styles.success}>
                        <div className={styles.successIcon}>✓</div>
                        <h2>Registration Complete!</h2>
                        <p className="text-muted">
                            Your cryptographic keys have been generated and stored securely.
                        </p>
                        <button className="btn btn-primary" onClick={onClose}>
                            Start Trading
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
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.header}>
                    <h2 className="gradient-text">ZEX Registration</h2>
                    <button className={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                {/* Progress Steps */}
                <div className={styles.steps}>
                    {['Wallet', 'Keys', 'Proof', 'Register'].map((label, i) => {
                        const stepIndex = ['connect', 'generate', 'prove', 'register'].indexOf(step);
                        const isComplete = i < stepIndex || isSuccess;
                        const isCurrent = i === stepIndex;

                        return (
                            <div
                                key={label}
                                className={`${styles.step} ${isComplete ? styles.complete : ''} ${isCurrent ? styles.current : ''}`}
                            >
                                <div className={styles.stepDot}>
                                    {isComplete ? '✓' : i + 1}
                                </div>
                                <span className={styles.stepLabel}>{label}</span>
                            </div>
                        );
                    })}
                </div>

                <div className={styles.content}>
                    <AnimatePresence mode="wait">
                        {step === 'connect' && (
                            <motion.div
                                key="connect"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className={styles.stepContent}
                            >
                                <h3>Connect Your Wallet</h3>
                                <p className="text-muted">
                                    Please connect your wallet to continue with registration.
                                </p>
                            </motion.div>
                        )}

                        {step === 'generate' && (
                            <motion.div
                                key="generate"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className={styles.stepContent}
                            >
                                <h3>Generate Cryptographic Keys</h3>
                                <p className="text-muted">
                                    We'll generate a BabyJubJub keypair for encrypting your balances
                                    and creating zero-knowledge proofs.
                                </p>
                                <div className={styles.warning}>
                                    <strong>⚠️ Important:</strong> Your keys will be stored in this browser.
                                    Clearing browser data will require re-registration.
                                </div>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleGenerateKeys}
                                >
                                    Generate Keys
                                </button>
                            </motion.div>
                        )}

                        {step === 'prove' && (
                            <motion.div
                                key="prove"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className={styles.stepContent}
                            >
                                <h3>Generate ZK Proof</h3>
                                <p className="text-muted">
                                    Creating a zero-knowledge proof to verify your key ownership.
                                    This may take 10-30 seconds.
                                </p>

                                {isGeneratingProof ? (
                                    <div className={styles.proofLoading}>
                                        <div className="spinner" />
                                        <p>{proofProgress || 'Generating proof...'}</p>
                                    </div>
                                ) : (
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleGenerateProof}
                                    >
                                        Generate Proof
                                    </button>
                                )}
                            </motion.div>
                        )}

                        {step === 'register' && (
                            <motion.div
                                key="register"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className={styles.stepContent}
                            >
                                <h3>Submit Registration</h3>
                                <p className="text-muted">
                                    {isPending
                                        ? 'Please confirm the transaction in your wallet...'
                                        : isConfirming
                                            ? 'Waiting for transaction confirmation...'
                                            : 'Ready to submit your registration to the blockchain.'
                                    }
                                </p>

                                <div className={styles.proofLoading}>
                                    <div className="spinner" />
                                    <p>{isPending ? 'Confirm in wallet' : 'Processing...'}</p>
                                </div>

                                {error && (
                                    <div className={styles.error}>
                                        Transaction failed: {error.message}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
