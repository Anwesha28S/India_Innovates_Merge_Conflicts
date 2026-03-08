'use client';
import { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showReset, setShowReset] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetMsg, setResetMsg] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    async function handleLogin(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            const snap = await getDoc(doc(db, 'users', cred.user.uid));
            const role = snap.exists() ? snap.data().role : 'user';
            if (role === 'admin') router.push('/admin');
            else router.push('/portal');
        } catch (err) {
            setError('Invalid email or password.');
        } finally {
            setLoading(false);
        }
    }

    async function handleForgotPassword(e) {
        e.preventDefault();
        setResetMsg('');
        setResetLoading(true);
        try {
            await sendPasswordResetEmail(auth, resetEmail);
            setResetMsg('Reset email sent! Check your inbox (and spam folder).');
        } catch (err) {
            if (err.code === 'auth/user-not-found') setResetMsg('No account found with that email.');
            else setResetMsg('Failed to send email. Please try again.');
        } finally {
            setResetLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-bg-deep font-sans flex items-center justify-center relative overflow-hidden">
            <div className="grid-bg" />
            <div className="glow-blob" style={{ width: 500, height: 500, top: -200, left: -100, opacity: 0.5, background: 'rgba(0,245,255,0.12)' }} />
            <div className="glow-blob" style={{ width: 400, height: 400, bottom: -100, right: -100, opacity: 0.4, background: 'rgba(124,58,237,0.12)' }} />

            <div className="relative z-10 w-full max-w-md mx-4 bg-[rgba(13,17,23,0.92)] backdrop-blur-xl border border-[rgba(124,58,237,0.25)] rounded-[32px] p-10 shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
                <div className="flex flex-col items-center mb-8">
                    <Link href="/" className="flex items-center gap-2.5 font-extrabold text-2xl mb-3 no-underline text-white">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-cyan to-accent-violet flex items-center justify-center text-2xl neon-cyan">⬡</div>
                        <span><span className="text-accent-cyan">Signal</span>Sync</span>
                    </Link>
                    <h2 className="text-xl font-bold mt-1">{showReset ? 'Reset Password' : 'Sign In'}</h2>
                    <p className="text-text-secondary text-sm mt-1 text-center">
                        {showReset ? "Enter your email — we'll send a reset link" : 'Access the Green Corridor Dispatcher'}
                    </p>
                </div>

                {showReset ? (
                    /* ── Forgot Password Form ── */
                    <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[0.78rem] font-semibold text-text-secondary uppercase tracking-wide">Email Address</label>
                            <input type="email" required className="input-field" value={resetEmail}
                                onChange={e => setResetEmail(e.target.value)} placeholder="your@email.com" />
                        </div>

                        {resetMsg && (
                            <p className={`text-sm text-center ${resetMsg.includes('sent') ? 'text-accent-green' : 'text-accent-red'}`}>
                                {resetMsg}
                            </p>
                        )}

                        <button type="submit" disabled={resetLoading}
                            className="w-full py-3.5 rounded-xl font-bold bg-gradient-to-br from-accent-violet to-[#7c3aed] text-white shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)] disabled:opacity-50 transition-all font-sans cursor-pointer">
                            {resetLoading ? 'Sending…' : 'Send Reset Email'}
                        </button>

                        <button type="button" onClick={() => { setShowReset(false); setResetMsg(''); }}
                            className="text-sm text-text-muted hover:text-white text-center font-sans cursor-pointer bg-transparent border-none">
                            ← Back to Sign In
                        </button>
                    </form>
                ) : (
                    /* ── Login Form ── */
                    <form onSubmit={handleLogin} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[0.78rem] font-semibold text-text-secondary uppercase tracking-wide">Email</label>
                            <input type="email" required className="input-field" value={email}
                                onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center">
                                <label className="text-[0.78rem] font-semibold text-text-secondary uppercase tracking-wide">Password</label>
                                <button type="button"
                                    onClick={() => { setShowReset(true); setResetEmail(email); }}
                                    className="text-[0.75rem] text-accent-cyan hover:underline font-sans cursor-pointer bg-transparent border-none">
                                    Forgot password?
                                </button>
                            </div>
                            <input type="password" required className="input-field" value={password}
                                onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                        </div>

                        {error && <p className="text-accent-red text-sm text-center">{error}</p>}

                        <button type="submit" disabled={loading}
                            className="w-full py-3.5 rounded-xl font-bold bg-gradient-to-br from-accent-cyan to-[#0099cc] text-black shadow-[0_0_20px_rgba(0,245,255,0.3)] hover:shadow-[0_0_30px_rgba(0,245,255,0.5)] disabled:opacity-50 transition-all font-sans cursor-pointer">
                            {loading ? 'Signing in…' : 'Sign In'}
                        </button>
                    </form>
                )}

                {!showReset && (
                    <>
                        <div className="mt-5 pt-4 border-t border-white/5 text-center text-sm text-text-muted">
                            No account?{' '}
                            <Link href="/auth/register" className="text-accent-cyan hover:underline">Register here</Link>
                        </div>
                        <div className="mt-2 text-center text-[0.7rem] text-text-muted">
                            Secured with Firebase Auth · AES-256 · RBAC
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
