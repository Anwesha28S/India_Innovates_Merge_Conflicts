from app.api.corridor import router as corridor_router
from app.api.signal import router as signal_router
from app.api.route import router as route_router
from app.api.vision import router as vision_router
from app.api.traffic import router as traffic_router
from app.api.health import router as health_router

__all__ = [
    "corridor_router", "signal_router", "route_router",
    "vision_router", "traffic_router", "health_router",
]
