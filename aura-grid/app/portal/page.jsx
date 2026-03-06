'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Badge from '@/components/Badge';
import StatusDot from '@/components/StatusDot';
import { useJsApiLoader, Autocomplete } from '@react-google-maps/api';
import { MAPS_LIBRARIES } from '@/components/DelhiMap';
import { useAuth } from '@/components/AuthProvider';
import { createCorridor, terminateCorridor, subscribeActiveCOrridors } from '@/lib/firestore';

const DelhiMap = dynamic(() => import('@/components/DelhiMap'), {
    ssr: false,
    loading: () => (
        <div style={{ height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050c18', borderRadius: '12px', color: '#00f5ff', fontSize: '0.9rem' }}>
            Loading map…
        </div>
    )
});

const CITIES = [
    { name: 'Delhi', bounds: { north: 28.883, south: 28.404, east: 77.347, west: 76.839 } },
    { name: 'Mumbai', bounds: { north: 19.269, south: 18.893, east: 73.047, west: 72.776 } },
    { name: 'Bengaluru', bounds: { north: 13.144, south: 12.832, east: 77.752, west: 77.458 } },
    { name: 'Hyderabad', bounds: { north: 17.540, south: 17.248, east: 78.631, west: 78.327 } },
    { name: 'Chennai', bounds: { north: 13.234, south: 12.953, east: 80.334, west: 80.207 } },
    { name: 'Pune', bounds: { north: 18.633, south: 18.418, east: 73.957, west: 73.768 } },
    { name: 'Kolkata', bounds: { north: 22.639, south: 22.395, east: 88.430, west: 88.246 } },
    { name: 'Ahmedabad', bounds: { north: 23.121, south: 22.922, east: 72.705, west: 72.490 } },
];

function PlaceInput({ label, placeholder, onPlaceSelect, cityBounds, keyId }) {
    const acRef = useRef(null);
    const acOptions = cityBounds
        ? { bounds: cityBounds, strictBounds: true, componentRestrictions: { country: 'in' } }
        : { componentRestrictions: { country: 'in' } };
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[0.78rem] font-semibold text-text-secondary uppercase tracking-wide">{label}</label>
            <Autocomplete key={keyId} onLoad={ac => { acRef.current = ac; }}
                onPlaceChanged={() => {
                    if (!acRef.current) return;
                    const place = acRef.current.getPlace();
                    if (place?.geometry?.location) {
                        onPlaceSelect({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng(), name: place.formatted_address || place.name || '' });
                    }
                }} options={acOptions}>
                <input className="input-field w-full" placeholder={placeholder} style={{ width: '100%' }} />
            </Autocomplete>
        </div>
    );
}

export default function PortalPage() {
    const { user, userProfile, logout } = useAuth();
    const router = useRouter();
    const isAdmin = userProfile?.role === 'admin';

    // Redirect if not logged in
    useEffect(() => {
        if (user === null && userProfile === null) {
            // loading could still be in progress — handled by AuthProvider hiding children
        }
    }, [user]);

    const { isLoaded: mapsLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries: MAPS_LIBRARIES,
    });

    const [city, setCity] = useState('Delhi');
    const [corridorType, setCorridorType] = useState('ambulance');
    const [originLatLng, setOriginLatLng] = useState(null);
    const [destLatLng, setDestLatLng] = useState(null);
    const [originName, setOriginName] = useState('');
    const [destName, setDestName] = useState('');
    const [adminVehicle, setAdminVehicle] = useState('');
    const [showCorridor, setShowCorridor] = useState(false);
    const [corridorActive, setCorridorActive] = useState(false);
    const [routeInfo, setRouteInfo] = useState(null);
    const [calculating, setCalculating] = useState(false);
    const [creating, setCreating] = useState(false);
    const [activeCds, setActiveCds] = useState([]);
    const [etaSec, setEtaSec] = useState(0);

    // Realtime active corridors from Firestore
    useEffect(() => {
        const unsub = subscribeActiveCOrridors(setActiveCds);
        return () => unsub();
    }, []);

    // ETA countdown
    useEffect(() => {
        if (!corridorActive || etaSec <= 0) return;
        const t = setInterval(() => setEtaSec(s => Math.max(0, s - 1)), 1000);
        return () => clearInterval(t);
    }, [corridorActive]);

    const handleRouteResult = useCallback((info) => {
        setRouteInfo(info);
        setEtaSec(info.durationSec || 0);
    }, []);

    function resetRoute() {
        setOriginLatLng(null); setDestLatLng(null);
        setOriginName(''); setDestName('');
        setShowCorridor(false); setCorridorActive(false); setRouteInfo(null);
    }

    function calcRoute() {
        if (!originLatLng || !destLatLng) return;
        setCalculating(true);
        setTimeout(() => { setCalculating(false); setShowCorridor(true); setCorridorActive(false); }, 600);
    }

    async function initiateWave() {
        if (!user || !originLatLng || !destLatLng) return;
        setCreating(true);
        try {
            const vehicleNum = isAdmin && adminVehicle.trim()
                ? adminVehicle.trim().toUpperCase()
                : (userProfile?.vehicleNumber || 'N/A');

            await createCorridor(user.uid, {
                creatorName: userProfile?.name || user.email,
                vehicleNumber: vehicleNum,
                vehicleType: corridorType,
                city,
                originName,
                destName,
                originLatLng,
                destLatLng,
                distanceText: routeInfo?.distanceText || '',
                durationText: routeInfo?.durationText || '',
            });
            setCorridorActive(true);
        } catch (err) {
            console.error('Failed to create corridor:', err);
        } finally {
            setCreating(false);
        }
    }

    async function handleTerminate(corridorId) {
        if (!user) return;
        await terminateCorridor(corridorId);
    }

    const canCalc = !!originLatLng && !!destLatLng;
    const cityBounds = CITIES.find(c => c.name === city)?.bounds;
    const etaStr = etaSec > 0 ? `${Math.floor(etaSec / 60)}m ${(etaSec % 60).toString().padStart(2, '0')}s` : routeInfo?.durationText || '—';

    // Not logged in — prompt to login
    if (!user) {
        return (
            <div className="min-h-screen bg-bg-deep font-sans flex items-center justify-center relative">
                <div className="grid-bg" />
                <div className="relative z-10 text-center p-10 bg-[rgba(13,17,23,0.9)] border border-white/10 rounded-2xl max-w-sm mx-4">
                    <div className="text-5xl mb-4">🔒</div>
                    <h2 className="text-xl font-bold mb-2">Authentication Required</h2>
                    <p className="text-text-secondary text-sm mb-6">Sign in to create and manage green corridors.</p>
                    <div className="flex gap-3 justify-center">
                        <Link href="/auth/login" className="px-5 py-2.5 rounded-xl font-bold bg-accent-cyan text-black no-underline text-sm">Sign In</Link>
                        <Link href="/auth/register" className="px-5 py-2.5 rounded-xl font-bold bg-white/5 border border-white/10 text-white no-underline text-sm">Register</Link>
                    </div>
                    <div className="mt-4"><Link href="/" className="text-xs text-text-muted no-underline hover:text-white">← Back to Home</Link></div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-bg-deep font-sans relative">
            <div className="grid-bg" />
            <nav className="relative z-10 flex items-center justify-between px-10 py-3.5 bg-bg-deep/95 border-b border-white/5 backdrop-blur-xl">
                <Link href="/" className="flex items-center gap-2.5 font-extrabold text-xl no-underline text-white">
                    <div className="w-8 h-8 rounded-[6px] bg-gradient-to-br from-accent-cyan to-accent-violet flex items-center justify-center neon-cyan">⬡</div>
                    <span><span className="text-accent-cyan">AURA</span>-GRID</span>
                </Link>
                <div className="flex items-center gap-2.5">
                    {isAdmin && <Badge variant="red">Administrator</Badge>}
                    <Badge variant="green"><StatusDot color="green" className="mr-1" />{userProfile?.name || user.email}</Badge>
                    {userProfile?.vehicleNumber && <Badge variant="violet">{userProfile.vehicleNumber}</Badge>}
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/dashboard" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/5 text-text-primary no-underline">Dashboard</Link>
                    {isAdmin && <Link href="/admin" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-accent-red/15 border border-accent-red/30 text-accent-red no-underline">Admin</Link>}
                    <button onClick={logout} className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[rgba(255,59,92,0.15)] text-accent-red border border-accent-red/30 font-sans cursor-pointer">Logout</button>
                </div>
            </nav>

            <div className="relative z-10 max-w-[1400px] mx-auto px-10 py-10">
                <div className="grid grid-cols-1 lg:grid-cols-[460px_1fr] gap-6">

                    {/* LEFT – Route Planner */}
                    <div className="flex flex-col gap-5">
                        <div className="bg-bg-card border border-white/5 rounded-xl p-6">
                            <Badge variant="red">
                                {corridorType === 'ambulance' ? 'Emergency Green Corridor' : corridorType === 'fire' ? 'Fire Truck Corridor' : 'VVIP Secure Corridor'}
                            </Badge>
                            <h3 className="text-lg font-bold mt-2.5 mb-1">Create Corridor</h3>
                            <p className="text-text-secondary text-sm mb-4">Select city, type origin and destination — Google Maps routes with live traffic.</p>

                            {/* City */}
                            <div className="flex flex-col gap-1.5 mb-4">
                                <label className="text-[0.78rem] font-semibold text-text-secondary uppercase tracking-wide">City</label>
                                <select className="input-field" value={city}
                                    onChange={e => { setCity(e.target.value); resetRoute(); }}
                                    style={{ color: '#0f172a', background: '#f8fafc' }}>
                                    {CITIES.map(c => <option key={c.name} value={c.name} style={{ color: '#0f172a' }}>{c.name}</option>)}
                                </select>
                            </div>

                            {/* Corridor type */}
                            <div className="flex gap-2 mb-4">
                                {[['ambulance', 'Ambulance'], ['fire', 'Fire Truck'], ['vvip', 'VVIP']].map(([v, l]) => (
                                    <button key={v} onClick={() => setCorridorType(v)}
                                        className={`flex-1 py-3 px-2 rounded-xl border text-sm transition-all font-sans cursor-pointer ${corridorType === v ? 'bg-accent-cyan/10 border-accent-cyan/35 text-accent-cyan' : 'bg-white/[0.03] border-white/5 text-text-secondary hover:border-accent-cyan/25'}`}>
                                        {l}
                                    </button>
                                ))}
                            </div>

                            {/* Admin vehicle override */}
                            {isAdmin && (
                                <div className="flex flex-col gap-1.5 mb-4">
                                    <label className="text-[0.78rem] font-semibold text-accent-red uppercase tracking-wide">Vehicle Number (Admin Override)</label>
                                    <input className="input-field font-mono" value={adminVehicle} onChange={e => setAdminVehicle(e.target.value)} placeholder="e.g. AMB-099, DL-1AB-2345" />
                                </div>
                            )}

                            <div className="flex flex-col gap-3.5">
                                {mapsLoaded ? (
                                    <PlaceInput key={`origin-${city}`} label="Origin" placeholder={`Start point in ${city}...`} cityBounds={cityBounds} onPlaceSelect={p => { setOriginLatLng({ lat: p.lat, lng: p.lng }); setOriginName(p.name); setShowCorridor(false); setCorridorActive(false); setRouteInfo(null); }} />
                                ) : <div className="flex flex-col gap-1.5"><label className="text-[0.78rem] font-semibold text-text-secondary uppercase tracking-wide">Origin</label><input disabled className="input-field opacity-50" placeholder="Loading Google Maps..." /></div>}

                                <div className="flex items-center gap-2.5">
                                    <div className="flex-1 h-px bg-white/10" />
                                    <button onClick={() => { const ol = originLatLng, on = originName; setOriginLatLng(destLatLng); setDestLatLng(ol); setOriginName(destName); setDestName(on); resetRoute(); }}
                                        className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-text-secondary font-sans cursor-pointer">⇅</button>
                                    <div className="flex-1 h-px bg-white/10" />
                                </div>

                                {mapsLoaded ? (
                                    <PlaceInput key={`dest-${city}`} label="Destination" placeholder={`End point in ${city}...`} cityBounds={cityBounds} onPlaceSelect={p => { setDestLatLng({ lat: p.lat, lng: p.lng }); setDestName(p.name); setShowCorridor(false); setCorridorActive(false); setRouteInfo(null); }} />
                                ) : <div className="flex flex-col gap-1.5"><label className="text-[0.78rem] font-semibold text-text-secondary uppercase tracking-wide">Destination</label><input disabled className="input-field opacity-50" placeholder="Loading Google Maps..." /></div>}

                                {!canCalc && <p className="text-[0.75rem] text-text-muted text-center">Select origin and destination to enable routing.</p>}

                                <button onClick={calcRoute} disabled={calculating || !canCalc}
                                    className="w-full py-3 rounded-xl font-bold bg-gradient-to-br from-accent-cyan to-[#0099cc] text-black disabled:opacity-50 hover:shadow-[0_0_20px_rgba(0,245,255,0.4)] transition-all font-sans cursor-pointer">
                                    {calculating ? 'Routing...' : 'Get Best Route'}
                                </button>
                            </div>

                            {/* Route result */}
                            {showCorridor && routeInfo && (
                                <div className="mt-5 pt-5 border-t border-white/10 flex flex-col gap-4">
                                    <div className="text-[0.7rem] text-text-muted uppercase tracking-widest">Google Maps Route</div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 bg-white/[0.02] border border-white/10 rounded-xl p-3.5">
                                            <div className="text-[0.68rem] text-text-muted uppercase mb-1">With Traffic</div>
                                            <div className="text-2xl font-extrabold font-mono text-accent-amber">{routeInfo.durationText}</div>
                                            <div className="text-xs text-text-secondary mt-1">{routeInfo.distanceText} · with signals</div>
                                        </div>
                                        <div className="text-xs font-extrabold text-text-muted bg-white/5 border border-white/10 rounded-full px-2.5 py-1.5">VS</div>
                                        <div className="flex-1 bg-accent-green/5 border border-accent-green/30 rounded-xl p-3.5">
                                            <div className="text-[0.68rem] text-text-muted uppercase mb-1">AURA-GRID Corridor</div>
                                            <div className="text-2xl font-extrabold font-mono text-accent-green">~{Math.round((routeInfo.durationSec * 0.6) / 60)}m</div>
                                            <div className="text-xs text-text-secondary mt-1">{routeInfo.distanceText} · zero stops</div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 bg-white/[0.02] border border-white/5 rounded-xl p-3.5">
                                        <div className="flex flex-col gap-1.5 flex-1">
                                            <div className="flex items-start gap-2">
                                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#00f5ff', display: 'inline-block', flexShrink: 0, marginTop: 3 }} />
                                                <span className="text-sm text-text-secondary">{originName}</span>
                                            </div>
                                            <div className="ml-[5px] w-0.5 h-4 bg-white/10" />
                                            <div className="flex items-start gap-2">
                                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#a78bfa', display: 'inline-block', flexShrink: 0, marginTop: 3 }} />
                                                <span className="text-sm text-text-secondary">{destName}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {!corridorActive && (
                                        <button onClick={initiateWave} disabled={creating}
                                            className="w-full py-4 rounded-xl font-bold text-base bg-gradient-to-br from-accent-green to-[#00cc7a] text-black shadow-[0_0_20px_rgba(0,255,157,0.3)] hover:shadow-[0_0_30px_rgba(0,255,157,0.6)] disabled:opacity-60 transition-all font-sans cursor-pointer">
                                            {creating ? 'Activating...' : 'Initiate Green Wave'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT – Map + Active Corridors */}
                    <div className="flex flex-col gap-5">
                        <div className="bg-bg-card border border-white/5 rounded-xl p-6">
                            <div className="flex justify-between items-center mb-3">
                                <div>
                                    <h3 className="text-base font-bold">Delhi Traffic Map</h3>
                                    <p className="text-text-secondary text-xs">{showCorridor && originName && destName ? `${originName} → ${destName}` : 'Select origin and destination above'}</p>
                                </div>
                                <Badge variant="cyan"><StatusDot color="cyan" className="mr-1" />Live</Badge>
                            </div>
                            <DelhiMap showCorridor={showCorridor} corridorActive={corridorActive}
                                originLatLng={originLatLng} destLatLng={destLatLng}
                                originName={originName} destName={destName}
                                onRouteResult={handleRouteResult} onNodeUpdate={() => { }} />
                        </div>

                        {/* Active corridors from Firestore */}
                        <div className="bg-bg-card border border-white/5 rounded-xl p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-base font-bold">Active Green Corridors</h3>
                                <Badge variant="green"><span className="w-1.5 h-1.5 rounded-full bg-accent-green inline-block mr-1" />{activeCds.length} Active</Badge>
                            </div>
                            {activeCds.length === 0 ? (
                                <p className="text-text-muted text-sm text-center py-4">No active corridors. Create one above.</p>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {activeCds.map(c => {
                                        const canTerminate = isAdmin || c.uid === user?.uid;
                                        return (
                                            <div key={c.id} className="bg-accent-cyan/[0.03] border border-accent-cyan/20 rounded-xl p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" />
                                                        <Badge variant="red">{c.vehicleNumber}</Badge>
                                                        <span className="text-[0.65rem] text-text-muted capitalize">{c.vehicleType}</span>
                                                    </div>
                                                    {canTerminate && (
                                                        <button onClick={() => handleTerminate(c.id)}
                                                            className="text-[0.6rem] font-bold text-accent-red border border-accent-red/30 rounded-lg px-2 py-0.5 bg-accent-red/10 hover:bg-accent-red/20 font-sans cursor-pointer">
                                                            TERMINATE
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="text-xs text-text-secondary">{c.originName} → {c.destName}</div>
                                                <div className="text-[0.65rem] text-text-muted mt-1">By {c.creatorName} · {c.city}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Active corridor detail */}
                        {corridorActive && (
                            <div className="bg-bg-card border border-white/5 rounded-xl p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <Badge variant="red">GREEN WAVE ACTIVE</Badge>
                                    <button onClick={() => setCorridorActive(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[rgba(255,59,92,0.15)] text-accent-red border border-accent-red/30 font-sans cursor-pointer">End View</button>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    {[['ETA', etaStr, 'text-accent-green'], ['Stops', '0', 'text-accent-green'], ['Distance', routeInfo?.distanceText || '—', 'text-accent-cyan']].map(([l, v, c]) => (
                                        <div key={l}><div className="text-[0.65rem] text-text-muted uppercase tracking-wide mb-1">{l}</div><div className={`font-bold font-mono text-lg ${c}`}>{v}</div></div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
