"""
SignalSync Edge AI Simulator — Multi-Node FastAPI MJPEG Video Streamer
======================================================================
Serves a separate live YOLO-annotated MJPEG stream for each camera node:
    http://localhost:8001/video_feed/CAM-01  …  /video_feed/CAM-06

Each node replays the same demo.mp4 but starts at a different frame offset
so each card on the dashboard looks visually distinct.

Also exposes a /stats endpoint with the latest per-node YOLO statistics and
pushes those stats to Firestore (if serviceAccountKey.json is present).

HOW TO RUN:
    cd edge-sim
    python streamer.py --video demo.mp4 --port 8001

HOW TO RUN (offline, no Firebase):
    python streamer.py --video demo.mp4 --no-firebase
"""

import cv2            # type: ignore
import time
import threading
import argparse
from ultralytics import YOLO  # type: ignore
from fastapi import FastAPI    # type: ignore
from fastapi.responses import StreamingResponse  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
import uvicorn                # type: ignore

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
CONFIDENCE_THRESHOLD = 0.35   # Lowered so more classes show on demo video
EMERGENCY_CLASSES    = {"ambulance", "truck", "bus"}
VEHICLE_CLASSES      = {"car", "motorcycle", "bus", "truck", "bicycle", "van", "ambulance"}

CAMERA_NODES = [
    {"id": "CAM-01", "name": "Connaught Place",   "offset_pct": 0.00},
    {"id": "CAM-02", "name": "AIIMS Junction",    "offset_pct": 0.17},
    {"id": "CAM-03", "name": "Karol Bagh",        "offset_pct": 0.33},
    {"id": "CAM-04", "name": "IGI Terminal 3",    "offset_pct": 0.50},
    {"id": "CAM-05", "name": "GTK Road Azadpur",  "offset_pct": 0.67},
    {"id": "CAM-06", "name": "Lajpat Nagar",      "offset_pct": 0.83},
]

# ---------------------------------------------------------------------------
# Shared state: latest stats per node (thread-safe via a lock)
# ---------------------------------------------------------------------------
_stats_lock = threading.Lock()
_latest_stats: dict = {
    node["id"]: {
        "vehicle_count": 0,
        "density_pct": 0,
        "class_breakdown": {},
        "emergency": False,
        "timestamp": 0.0,
    }
    for node in CAMERA_NODES
}

# ---------------------------------------------------------------------------
# YOLO model — loaded once, shared across all threads
# ---------------------------------------------------------------------------
_model = None
_model_lock = threading.Lock()

def get_model():
    global _model
    with _model_lock:
        if _model is None:
            print("[YOLO] Loading yolov8n.pt model …")
            _model = YOLO("yolov8n.pt")
            print("[YOLO] Model ready.\n")
    return _model


# ---------------------------------------------------------------------------
# Per-node frame generator
# ---------------------------------------------------------------------------
def generate_frames(video_path: str, node: dict, use_firebase: bool, fb=None):
    """
    Yields MJPEG frames for a single camera node.
    The video starts at node['offset_pct'] * total_frames so each node
    appears to show a different moment in time.
    """
    cap = cv2.VideoCapture(video_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    start_frame = int(total * node["offset_pct"])
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    model = get_model()
    node_id   = node["id"]
    node_name = node["name"]

    last_push  = 0.0   # timestamp of last Firebase push
    PUSH_EVERY = 2.0   # seconds between stat pushes

    while True:
        ret, frame = cap.read()
        if not ret:
            # Loop back to start (not the offset, to keep looping naturally)
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        # ── YOLO inference ────────────────────────────────────────────────
        results = model(frame, conf=CONFIDENCE_THRESHOLD, verbose=False)

        vehicle_count  = 0
        class_breakdown = {}
        total_box_area  = 0
        frame_area      = frame.shape[0] * frame.shape[1]

        for r in results:
            for box in r.boxes:          # type: ignore
                cls_name = model.names[int(box.cls[0])].lower()   # type: ignore
                conf     = float(box.conf[0])                      # type: ignore
                x1, y1, x2, y2 = map(int, box.xyxy[0])           # type: ignore

                # Colour: emergency = green, vehicle = cyan, other = dim blue
                if cls_name in EMERGENCY_CLASSES:
                    colour = (0, 255, 100)
                elif cls_name in VEHICLE_CLASSES:
                    colour = (0, 220, 255)
                    vehicle_count += 1
                    box_area = (x2 - x1) * (y2 - y1)
                    total_box_area += box_area
                    class_breakdown[cls_name] = class_breakdown.get(cls_name, 0) + 1
                else:
                    colour = (80, 80, 200)

                cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)
                cv2.putText(frame, f"{cls_name} {conf:.0%}",
                            (x1, max(y1 - 6, 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.46, colour, 1)

        # ── Compute density ───────────────────────────────────────────────
        raw_density = min(100, int((total_box_area / max(frame_area, 1)) * 1800))
        # Add some per-node variation so cards look different
        variation   = (hash(node_id) % 20) - 10   # fixed offset per node
        density_pct = max(5, min(97, raw_density + variation))

        # ── Update shared stats dict ──────────────────────────────────────
        now = time.time()
        with _stats_lock:
            _latest_stats[node_id] = {
                "vehicle_count":   vehicle_count,
                "density_pct":     density_pct,
                "class_breakdown": class_breakdown,
                "emergency":       any(
                    cls_name in EMERGENCY_CLASSES
                    for r in results for box in r.boxes
                    for cls_name in [model.names[int(box.cls[0])].lower()]  # type: ignore
                ),
                "timestamp": now,
            }

        # ── Push to Firebase every PUSH_EVERY seconds ─────────────────────
        if use_firebase and fb and (now - last_push) >= PUSH_EVERY:
            try:
                fb.push_stats(node_id, {
                    "vehicle_count":   vehicle_count,
                    "density_pct":     density_pct,
                    "class_breakdown": class_breakdown,
                    "node_name":       node_name,
                })
                last_push = now
            except Exception as e:
                print(f"[Firebase] Push error for {node_id}: {e}")

        # ── Status bar overlay ────────────────────────────────────────────
        cv2.rectangle(frame, (0, 0), (frame.shape[1], 26), (6, 10, 20), -1)
        cv2.putText(frame,
                    f"{node_id}  {node_name}  |  Vehicles: {vehicle_count}  |  Density: {density_pct}%  |  YOLO-v8n",
                    (8, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (0, 200, 255), 1)

        # ── Encode as MJPEG ───────────────────────────────────────────────
        _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
               + buffer.tobytes() + b"\r\n")

    cap.release()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="SignalSync Multi-Node Stream")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# These will be set before uvicorn starts
_video_path  = "demo.mp4"
_use_firebase = False
_fb_module   = None


@app.get("/video_feed/{cam_id}")
def video_feed(cam_id: str):
    """MJPEG stream for a specific camera node.  cam_id e.g. CAM-01"""
    node = next((n for n in CAMERA_NODES if n["id"] == cam_id), CAMERA_NODES[0])
    return StreamingResponse(
        generate_frames(_video_path, node, _use_firebase, _fb_module),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/video_feed")
def video_feed_default():
    """Fallback: serves CAM-01 stream (backwards compatibility)."""
    return StreamingResponse(
        generate_frames(_video_path, CAMERA_NODES[0], _use_firebase, _fb_module),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/stats")
def get_stats():
    """Returns the latest per-node YOLO statistics as JSON."""
    with _stats_lock:
        return dict(_latest_stats)


@app.get("/stats/{cam_id}")
def get_node_stats(cam_id: str):
    """Returns the latest stats for a single camera node."""
    with _stats_lock:
        return _latest_stats.get(cam_id, {"error": "Unknown node"})


@app.get("/health")
def health():
    return {"status": "ok", "service": "SignalSync Multi-Node Streamer", "nodes": len(CAMERA_NODES)}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SignalSync Multi-Node MJPEG Streamer")
    parser.add_argument("--video",       default="demo.mp4", help="Path to demo video file")
    parser.add_argument("--port",        default=8001, type=int, help="Port to serve on")
    parser.add_argument("--no-firebase", action="store_true",   help="Skip Firebase push")
    args = parser.parse_args()

    _video_path   = args.video
    _use_firebase = not args.no_firebase

    if _use_firebase:
        try:
            import firebase_client as fb  # type: ignore
            _fb_module = fb
            print("[Firebase] firebase_client.py loaded — stats will be pushed to Firestore.")
        except Exception as e:
            print(f"[WARNING] Could not load firebase_client: {e}")
            print("[WARNING] Running without Firebase.\n")
            _use_firebase = False

    print(f"\n[Streamer] Starting SignalSync Multi-Node Streamer on port {args.port}")
    print(f"[Streamer] Video source: {args.video}")
    print(f"[Streamer] Firebase push: {'enabled' if _use_firebase else 'disabled (offline)'}")
    print(f"\n[Streamer] Stream URLs:")
    for node in CAMERA_NODES:
        print(f"  http://localhost:{args.port}/video_feed/{node['id']}  →  {node['name']}")
    print(f"\n[Streamer] Stats API:  http://localhost:{args.port}/stats")
    print(f"[Streamer] Health:     http://localhost:{args.port}/health\n")

    uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="warning")
