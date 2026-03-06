'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DELHI_NODES, GRAPH, dijkstra } from '@/components/delhiData';

// Fix default leaflet icon paths broken by Next.js bundler
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});


// ─── Utilities ────────────────────────────────────────────────────────────────
function haversine(a, b) {
    const R = 6371000;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLng = (b[1] - a[1]) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 +
        Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function closestIndex(routeCoords, pos) {
    let best = 0, bestDist = Infinity;
    routeCoords.forEach((c, i) => {
        const d = haversine(c, pos);
        if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
}

// ─── Icon Factories (called inside component, never at module scope) ──────────
function makePin(color, glowColor, size = 12) {
    return L.divIcon({
        className: '',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid ${glowColor};box-shadow:0 0 8px ${glowColor}80;"></div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    });
}
function makeCircle(color, border, size = 18) {
    return L.divIcon({
        className: '',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid ${border};box-shadow:0 0 12px ${color};"></div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    });
}
function makeAmbulance() {
    return L.divIcon({
        className: '',
        html: '<div style="width:26px;height:26px;border-radius:50%;background:#00f5ff;border:3px solid #fff;box-shadow:0 0 14px #00f5ff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;color:#0a0f1e;">+</div>',
        iconSize: [26, 26], iconAnchor: [13, 13],
    });
}
function nodeIcon(state) {
    const map = {
        cleared: ['#00ff9d', '#00ff9d'],
        active: ['#00f5ff', '#00f5ff'],
        prep: ['#ffb800', '#ffb800'],
        pending: ['#64748b', 'transparent'],
    };
    const [bg, glow] = map[state] || map.pending;
    return makePin(bg, glow, 12);
}

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILES_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// ─── Inner component: updates map view when centre changes (avoids remounting MapContainer) ──
function ChangeMapView({ center }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, map.getZoom(), { animate: true, duration: 0.8 });
    }, [center[0], center[1]]);
    return null;
}

// ─── Moving Ambulance ─────────────────────────────────────────────────────────
function MovingAmbulance({ routeCoords, active, nodeThresholds, onNodeUpdate, totalNodes }) {
    const timerRef = useRef(null);
    const indexRef = useRef(0);
    const lastNodeRef = useRef(-1);
    const [pos, setPos] = useState(routeCoords[0] || [28.59, 77.12]);
    // create icon inside component (browser env guaranteed)
    const icon = useRef(null);
    if (!icon.current) icon.current = makeAmbulance();

    useEffect(() => {
        if (!active || routeCoords.length === 0) return;
        indexRef.current = 0;
        lastNodeRef.current = -1;
        setPos(routeCoords[0]);
        const step = () => {
            if (indexRef.current >= routeCoords.length - 1) {
                onNodeUpdate && onNodeUpdate(totalNodes);
                return;
            }
            indexRef.current += 1;
            setPos(routeCoords[indexRef.current]);
            if (nodeThresholds && onNodeUpdate) {
                for (let n = lastNodeRef.current + 1; n < nodeThresholds.length; n++) {
                    if (indexRef.current >= nodeThresholds[n]) {
                        lastNodeRef.current = n;
                        onNodeUpdate(n);
                    }
                }
            }
            timerRef.current = setTimeout(step, 70);
        };
        timerRef.current = setTimeout(step, 70);
        return () => clearTimeout(timerRef.current);
    }, [active, routeCoords]);

    return <Marker position={pos} icon={icon.current} />;
}

function getNodeState(nodeIdx, activeNode) {
    if (activeNode === null || activeNode === undefined) return 'pending';
    if (nodeIdx < activeNode) return 'cleared';
    if (nodeIdx === activeNode) return 'active';
    if (nodeIdx === activeNode + 1) return 'prep';
    return 'pending';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DelhiMap({ showCorridor, corridorActive, originId, destinationId, pathNodeIds, onNodeUpdate }) {
    const [routeCoords, setRouteCoords] = useState([]);
    const [nodeThresholds, setNodeThresholds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeNode, setActiveNode] = useState(null);

    // Create icons inside component so DOM is always available
    const originIconRef = useRef(null);
    const destIconRef = useRef(null);
    if (!originIconRef.current) originIconRef.current = makeCircle('#00f5ff', '#fff');
    if (!destIconRef.current) destIconRef.current = makeCircle('#a78bfa', '#fff');

    const nodeById = (id) => DELHI_NODES.find(n => n.id === id);
    const origin = nodeById(originId) || DELHI_NODES[0];
    const destination = nodeById(destinationId) || DELHI_NODES[7];

    const intermediateNodes = (pathNodeIds || [])
        .slice(1, -1)
        .map(id => DELHI_NODES.find(n => n.id === id))
        .filter(Boolean);

    const handleNodeUpdate = useCallback((n) => {
        setActiveNode(n);
        onNodeUpdate && onNodeUpdate(n);
    }, [onNodeUpdate]);

    const mapCenter = [
        (origin.pos[0] + destination.pos[0]) / 2,
        (origin.pos[1] + destination.pos[1]) / 2,
    ];

    useEffect(() => {
        if (!showCorridor || !pathNodeIds || pathNodeIds.length < 2) {
            setRouteCoords([]);
            setActiveNode(null);
            return;
        }
        setLoading(true);
        setActiveNode(null);

        const waypoints = pathNodeIds.map(id => nodeById(id)?.pos).filter(Boolean);
        const coordStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

        fetch(url)
            .then(r => r.json())
            .then(data => {
                if (data.routes && data.routes[0]) {
                    const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
                    setRouteCoords(coords);
                    setNodeThresholds(intermediateNodes.map(node => closestIndex(coords, node.pos)));
                }
                setLoading(false);
            })
            .catch(() => {
                setRouteCoords(waypoints);
                setNodeThresholds(intermediateNodes.map((_, i) =>
                    Math.floor((i + 1) * waypoints.length / (intermediateNodes.length + 1))
                ));
                setLoading(false);
            });
    }, [showCorridor, pathNodeIds?.join(',')]);

    return (
        <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', height: '380px' }}>
            {loading && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(5,12,24,0.75)', color: '#00f5ff', fontSize: '0.9rem', fontWeight: 600,
                }}>
                    Computing shortest path via OSRM...
                </div>
            )}
            {/* 
                No `key` prop on MapContainer — remounting MapContainer on every
                origin/destination change causes Leaflet to try to appendChild into
                a pane that React already unmounted (React 18 Strict Mode issue).
                Instead, ChangeMapView updates the center reactively from inside.
            */}
            <MapContainer
                center={mapCenter}
                zoom={11}
                style={{ height: '100%', width: '100%', background: '#050c18' }}
                zoomControl={true}
                attributionControl={false}
            >
                <TileLayer url={DARK_TILES} attribution={TILES_ATTR} />

                {/* Reactively recentre the map without remounting the whole container */}
                <ChangeMapView center={mapCenter} />

                {/* Origin marker */}
                <Marker position={origin.pos} icon={originIconRef.current}>
                    <Popup><strong>Origin</strong><br />{origin.name}</Popup>
                </Marker>

                {/* Destination marker */}
                <Marker position={destination.pos} icon={destIconRef.current}>
                    <Popup><strong>Destination</strong><br />{destination.name}</Popup>
                </Marker>

                {/* Corridor route line */}
                {showCorridor && routeCoords.length > 0 && (
                    <Polyline
                        positions={routeCoords}
                        pathOptions={{
                            color: '#00f5ff', weight: 4, opacity: 0.9,
                            dashArray: corridorActive ? null : '10, 6',
                        }}
                    />
                )}

                {/* Intermediate node markers */}
                {showCorridor && intermediateNodes.map((node, i) => {
                    const state = corridorActive ? getNodeState(i, activeNode) : 'pending';
                    return (
                        <Marker key={node.id} position={node.pos} icon={nodeIcon(state)}>
                            <Popup>
                                <span style={{ fontWeight: 700, color: '#0f172a' }}>{node.id}</span><br />
                                {node.name}
                            </Popup>
                        </Marker>
                    );
                })}

                {/* Ambulance animation */}
                {corridorActive && routeCoords.length > 0 && (
                    <MovingAmbulance
                        routeCoords={routeCoords}
                        active={corridorActive}
                        nodeThresholds={nodeThresholds}
                        onNodeUpdate={handleNodeUpdate}
                        totalNodes={intermediateNodes.length}
                    />
                )}
            </MapContainer>

            {/* Legend */}
            <div style={{
                position: 'absolute', bottom: '10px', right: '10px', zIndex: 500,
                background: 'rgba(5,12,24,0.88)', border: '1px solid rgba(0,245,255,0.15)',
                borderRadius: '8px', padding: '6px 10px', display: 'flex', gap: '10px',
                fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)',
            }}>
                {[['#00ff9d', 'Cleared'], ['#00f5ff', 'In Transit'], ['#ffb800', 'Preempting'], ['#64748b', 'Queued']].map(([c, l]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c, display: 'inline-block' }} />
                        {l}
                    </span>
                ))}
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '20px', height: '3px', background: '#00f5ff', display: 'inline-block' }} />
                    Corridor
                </span>
            </div>
        </div>
    );
}
