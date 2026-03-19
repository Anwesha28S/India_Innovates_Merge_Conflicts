'use client';
import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const SIG_COLOR = { green: '#00ff9d', yellow: '#ffb800', red: '#ff3b5c' };
const SIG_GLOW  = { green: '0 0 12px #00ff9d99', yellow: '0 0 12px #ffb80099', red: '0 0 12px #ff3b5c99' };
const STREAM_BASE = 'http://localhost:8001';

/* ── Stat card ─────────────────────────────────────────────────────────────── */
function StatCard({ label, value, unit = '', color = '#00f5ff', sub = '' }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${color}22`,
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            flex: 1,
            minWidth: 100,
        }}>
            <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'monospace', color, lineHeight: 1.1 }}>
                {value}<span style={{ fontSize: '0.75rem', marginLeft: 3, opacity: 0.7 }}>{unit}</span>
            </div>
            {sub && <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', marginTop: 1 }}>{sub}</div>}
        </div>
    );
}

/* ── Class breakdown bar ───────────────────────────────────────────────────── */
function ClassBar({ label, count, total, color }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>
                <span>{label}</span>
                <span style={{ fontFamily: 'monospace', color }}>{count} <span style={{ opacity: 0.5 }}>({pct}%)</span></span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, boxShadow: `0 0 6px ${color}55`, transition: 'width 0.8s ease' }} />
            </div>
        </div>
    );
}

/* ── 3-bulb signal pole ────────────────────────────────────────────────────── */
function BigSignalLamp({ active }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 8px', background: '#050a14', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
            {['red', 'yellow', 'green'].map(c => (
                <div key={c} style={{ width: 20, height: 20, borderRadius: '50%', background: c === active ? SIG_COLOR[c] : 'rgba(255,255,255,0.05)', boxShadow: c === active ? SIG_GLOW[c] : 'none', transition: 'all 0.4s ease' }} />
            ))}
        </div>
    );
}

/* ── Main Modal ─────────────────────────────────────────────────────────────── */
export default function IntersectionModal({ cam, camState, onClose }) {
    const [firestoreStats, setFirestoreStats] = useState(null);
    const [streamOk, setStreamOk]             = useState(true);
    const imgRef                              = useRef(null);

    // Listen to Firestore for real-time stats
    useEffect(() => {
        if (!cam) return;
        const unsub = onSnapshot(
            doc(db, 'intersection_stats', cam.id),
            (snap) => {
                if (snap.exists()) setFirestoreStats(snap.data());
            },
            (err) => console.warn('[Modal] Firestore error:', err)
        );
        return () => unsub();
    }, [cam]);

    // Close on ESC
    useEffect(() => {
        const handle = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handle);
        return () => window.removeEventListener('keydown', handle);
    }, [onClose]);

    if (!cam) return null;

    const signal       = camState?.phase      || 'red';
    const timer        = camState?.timer      || 0;
    const density      = firestoreStats?.density_pct  ?? camState?.density ?? 0;
    const vehicleCount = firestoreStats?.vehicle_count ?? 0;
    const breakdown    = firestoreStats?.class_breakdown ?? {};
    const totalBreakdown = Object.values(breakdown).reduce((s, v) => s + v, 0);
    const barColor     = density < 40 ? '#00ff9d' : density < 70 ? '#ffb800' : '#ff3b5c';
    const streamUrl    = `${STREAM_BASE}/video_feed/${cam.id}`;
    const isSource     = firestoreStats?.source === 'edge-ai-streamer';

    const CLASS_COLORS = {
        car: '#00f5ff', truck: '#ff3b5c', bus: '#ffb800',
        motorcycle: '#a78bfa', bicycle: '#00ff9d', person: '#f97316',
        van: '#38bdf8', ambulance: '#ff0060',
    };

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(2,5,12,0.92)',
                backdropFilter: 'blur(12px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px',
                animation: 'fadeIn 0.2s ease',
            }}
        >
            <div style={{
                width: '100%', maxWidth: 980,
                background: 'rgba(7,12,24,0.98)',
                border: '1px solid rgba(0,245,255,0.15)',
                borderRadius: 20,
                overflow: 'hidden',
                boxShadow: '0 0 60px rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '90vh',
            }}>

                {/* ── Header ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff9d', boxShadow: '0 0 10px #00ff9d', animation: 'pulse-dot 1.2s infinite' }} />
                            <span style={{ fontSize: '0.55rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em' }}>{cam.id} · LIVE · YOLO-v8n</span>
                            {isSource && <span style={{ fontSize: '0.44rem', fontWeight: 800, color: '#00ff9d', background: 'rgba(0,255,157,0.1)', border: '1px solid rgba(0,255,157,0.3)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.06em' }}>EDGE AI CONNECTED</span>}
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>{cam.name}</div>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{cam.road}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.5)', fontSize: '1rem', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                </div>

                {/* ── Body ── */}
                <div style={{ display: 'flex', gap: 0, flex: 1, overflow: 'hidden', minHeight: 0 }}>

                    {/* ── Left: Video Feed ── */}
                    <div style={{ flex: 1.4, position: 'relative', background: '#020509', minHeight: 380 }}>
                        {streamOk ? (
                            <img
                                ref={imgRef}
                                src={streamUrl}
                                alt={`${cam.name} live YOLO feed`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                onError={() => setStreamOk(false)}
                            />
                        ) : (
                            <>
                                {/* Fallback: loop demo.mp4 while streamer is offline */}
                                <video
                                    src="/demo.mp4"
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
                                />
                                {/* DEMO MODE badge */}
                                <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 5, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,184,0,0.15)', border: '1px solid rgba(255,184,0,0.5)', borderRadius: 6, padding: '3px 8px' }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffb800', animation: 'pulse-dot 1.2s infinite' }} />
                                    <span style={{ fontSize: '0.5rem', fontWeight: 800, color: '#ffb800', fontFamily: 'monospace', letterSpacing: '0.08em' }}>DEMO MODE — Streamer offline</span>
                                </div>
                                {/* Retry button */}
                                <button
                                    onClick={() => { setStreamOk(true); setTimeout(() => { if (imgRef.current) imgRef.current.src = streamUrl + '?t=' + Date.now(); }, 100); }}
                                    style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 5, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(0,245,255,0.3)', background: 'rgba(0,0,0,0.6)', color: '#00f5ff', fontSize: '0.65rem', cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(4px)' }}
                                >
                                    Retry Live Stream
                                </button>
                            </>
                        )}

                        {/* Scanline overlay */}
                        <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'rgba(0,245,255,0.3)', animation: 'scanline 2.4s linear infinite', pointerEvents: 'none', zIndex: 2 }} />
                        {/* Grid overlay */}
                        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,245,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,0.02) 1px,transparent 1px)', backgroundSize: '20px 20px', pointerEvents: 'none', zIndex: 2 }} />

                        {/* REC badge */}
                        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 4, zIndex: 3 }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff3b5c', animation: 'pulse-dot 1.2s infinite' }} />
                            <span style={{ fontSize: '0.45rem', fontWeight: 800, color: '#ff3b5c', fontFamily: 'monospace', letterSpacing: '0.08em' }}>REC</span>
                        </div>

                        {/* Stream URL badge */}
                        <div style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 3, background: 'rgba(0,0,0,0.65)', borderRadius: 5, padding: '2px 7px', fontSize: '0.44rem', fontFamily: 'monospace', color: 'rgba(0,245,255,0.6)' }}>
                            {streamUrl}
                        </div>
                    </div>

                    {/* ── Right: Stats Panel ── */}
                    <div style={{ width: 300, borderLeft: '1px solid rgba(255,255,255,0.05)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>

                        {/* Signal Status */}
                        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Signal Status</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <BigSignalLamp active={signal} />
                                <div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'monospace', color: SIG_COLOR[signal], textShadow: SIG_GLOW[signal] }}>
                                        {signal.toUpperCase()}
                                    </div>
                                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                                        {timer > 0 ? `${timer}s remaining` : 'Switching…'}
                                    </div>
                                    <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.18)', marginTop: 1 }}>
                                        N/S: <span style={{ color: signal === 'green' ? SIG_COLOR.green : SIG_COLOR.red }}>{signal === 'green' ? 'GREEN' : 'RED'}</span>
                                        {' '}·{' '}
                                        E/W: <span style={{ color: signal === 'green' ? SIG_COLOR.red : SIG_COLOR.green }}>{signal === 'green' ? 'RED' : 'GREEN'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Key Stats */}
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            <StatCard label="Vehicles" value={vehicleCount} sub={isSource ? 'YOLO computed' : 'Awaiting YOLO'} color="#00f5ff" />
                            <StatCard label="Density" value={density} unit="%" color={barColor} sub={`${density < 40 ? 'Light' : density < 70 ? 'Moderate' : 'Heavy'} traffic`} />
                        </div>

                        {/* Density bar */}
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Traffic Density</div>
                            <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${density}%`, background: `linear-gradient(90deg, ${barColor}88, ${barColor})`, borderRadius: 6, boxShadow: `0 0 8px ${barColor}66`, transition: 'width 0.9s ease, background 0.5s ease' }} />
                            </div>
                        </div>

                        {/* Class Breakdown */}
                        <div style={{ padding: '12px 16px', flex: 1 }}>
                            <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                                Vehicle Class Breakdown
                                {!isSource && <span style={{ marginLeft: 6, color: 'rgba(255,255,255,0.12)' }}>(Start streamer for live data)</span>}
                            </div>
                            {Object.keys(breakdown).length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {Object.entries(breakdown)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([cls, count]) => (
                                            <ClassBar
                                                key={cls}
                                                label={cls.charAt(0).toUpperCase() + cls.slice(1)}
                                                count={count}
                                                total={totalBreakdown}
                                                color={CLASS_COLORS[cls] || '#94a3b8'}
                                            />
                                        ))
                                    }
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {[
                                        ['Car', Math.floor(vehicleCount * 0.6 || Math.random() * 10 + 3), '#00f5ff'],
                                        ['Motorcycle', Math.floor(vehicleCount * 0.25 || Math.random() * 5 + 1), '#a78bfa'],
                                        ['Bus', Math.floor(vehicleCount * 0.1 || Math.random() * 3), '#ffb800'],
                                        ['Truck', Math.floor(vehicleCount * 0.05 || Math.random() * 2), '#ff3b5c'],
                                    ].map(([cls, count, color]) => (
                                        <ClassBar key={cls} label={cls} count={Math.round(count)} total={Math.max(vehicleCount, 1)} color={color} />
                                    ))}
                                    <div style={{ fontSize: '0.46rem', color: 'rgba(255,255,255,0.15)', fontStyle: 'italic', marginTop: 4 }}>
                                        Estimated — connect Edge AI for real-time breakdown
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Timestamp */}
                        {firestoreStats?.updated_at && (
                            <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: '0.44rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)' }}>
                                    Last updated: {new Date(firestoreStats.updated_at).toLocaleTimeString('en-IN', { hour12: false })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn   { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }
                @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.75)} }
                @keyframes scanline  { 0%{top:0} 100%{top:100%} }
            `}</style>
        </div>
    );
}
