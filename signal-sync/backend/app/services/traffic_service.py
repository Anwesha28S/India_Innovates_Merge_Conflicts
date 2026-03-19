from datetime import datetime, timezone
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Intersection, TrafficLog
from app.redis_client import redis_set, traffic_key, get_redis
from app.schemas.traffic import TrafficUpdateRequest, TrafficStateOut, TrafficLiveResponse
from app.redis_client import signal_key, redis_get
from app.websocket.manager import ws_manager
import structlog

log = structlog.get_logger(__name__)


class TrafficService:

    @staticmethod
    async def update(req: TrafficUpdateRequest, db: AsyncSession) -> None:
        # Update Redis live state
        now = datetime.now(timezone.utc).isoformat()
        data = {
            "intersection_id": req.intersection_id,
            "density_pct": req.density_pct,
            "vehicle_count": req.vehicle_count,
            "source": req.source,
            "updated_at": now,
        }
        await redis_set(traffic_key(req.intersection_id), data)

        # Persist to traffic_logs for analytics
        log_entry = TrafficLog(
            intersection_id=req.intersection_id,
            density_pct=req.density_pct,
            vehicle_count=req.vehicle_count,
        )
        db.add(log_entry)

        # Broadcast live update
        await ws_manager.broadcast_intersection(req.intersection_id, {
            "event": "TRAFFIC_UPDATED",
            **data,
        })
        log.debug("Traffic updated", intersection_id=req.intersection_id, density=req.density_pct)

    @staticmethod
    async def get_live(db: AsyncSession) -> TrafficLiveResponse:
        result = await db.execute(select(Intersection).where(Intersection.is_active == True))
        intersections = result.scalars().all()

        out: List[TrafficStateOut] = []
        for i in intersections:
            t_data = await redis_get(traffic_key(i.id)) or {}
            s_data = await redis_get(signal_key(i.id)) or {}
            out.append(TrafficStateOut(
                intersection_id=i.id,
                density_pct=t_data.get("density_pct", 0),
                vehicle_count=t_data.get("vehicle_count", 0),
                signal_state=s_data.get("state", "NORMAL"),
                updated_at=t_data.get("updated_at", ""),
            ))

        return TrafficLiveResponse(intersections=out)
