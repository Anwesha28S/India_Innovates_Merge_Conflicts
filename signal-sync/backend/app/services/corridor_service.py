from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Corridor, CorridorStatus, CorridorType, User
from app.schemas.corridor import CorridorCreateRequest, CorridorOut
from app.redis_client import redis_set, redis_get, corridor_key
from app.services.signal_service import SignalService
from app.services.audit_service import AuditService
from app.services.conflict_engine import ConflictEngine
from app.websocket.manager import ws_manager
import structlog

log = structlog.get_logger(__name__)


class CorridorService:

    @staticmethod
    async def create(
        req: CorridorCreateRequest,
        user: User,
        db: AsyncSession,
    ) -> Corridor:
        corridor = Corridor(
            firebase_uid=user.firebase_uid,
            corridor_type=req.corridor_type,
            status=CorridorStatus.PENDING,
            origin_name=req.origin_name,
            dest_name=req.dest_name,
            origin_lat=req.origin_lat,
            origin_lng=req.origin_lng,
            dest_lat=req.dest_lat,
            dest_lng=req.dest_lng,
            node_ids=req.node_ids,
            node_snapshot=req.node_snapshot,
            priority_level=req.priority_level,
        )
        db.add(corridor)
        await db.flush()

        # Register in conflict queue
        await ConflictEngine.register(corridor)
        await AuditService.log(db, user.firebase_uid, corridor.id, "CORRIDOR_CREATED", {
            "type": req.corridor_type.value,
            "nodes": req.node_ids,
        })

        log.info("Corridor created", corridor_id=corridor.id, type=req.corridor_type)
        return corridor

    @staticmethod
    async def start(corridor_id: str, user: User, db: AsyncSession) -> Corridor:
        result = await db.execute(select(Corridor).where(Corridor.id == corridor_id))
        corridor = result.scalar_one_or_none()
        if not corridor:
            raise ValueError(f"Corridor {corridor_id} not found")
        if corridor.status != CorridorStatus.PENDING:
            raise ValueError(f"Corridor is {corridor.status.value}, cannot start")

        corridor.status = CorridorStatus.ACTIVE
        corridor.started_at = datetime.now(timezone.utc)
        corridor.active_node_index = 0

        # Schedule green phases for all nodes with staggered advance timing
        from app.config import settings
        for i, node_id in enumerate(corridor.node_ids):
            await SignalService.schedule_green_corridor(
                intersection_id=node_id,
                corridor_id=corridor_id,
                offset_sec=i * settings.green_corridor_advance_sec,
                duration_sec=settings.default_green_duration,
            )

        # Cache active corridor state in Redis
        await redis_set(corridor_key(corridor_id), {
            "status": "active",
            "active_node": 0,
            "node_ids": corridor.node_ids,
        })

        await AuditService.log(db, user.firebase_uid, corridor_id, "CORRIDOR_STARTED", {})

        # Broadcast WebSocket event
        await ws_manager.broadcast_corridor(corridor_id, {
            "event": "CORRIDOR_STARTED",
            "corridor_id": corridor_id,
            "node_ids": corridor.node_ids,
        })
        return corridor

    @staticmethod
    async def stop(corridor_id: str, reason: Optional[str], user: User, db: AsyncSession) -> Corridor:
        result = await db.execute(select(Corridor).where(Corridor.id == corridor_id))
        corridor = result.scalar_one_or_none()
        if not corridor:
            raise ValueError(f"Corridor {corridor_id} not found")

        corridor.status = CorridorStatus.COMPLETED
        corridor.completed_at = datetime.now(timezone.utc)

        # Restore all corridor signals to AI_DYNAMIC
        for node_id in corridor.node_ids:
            await SignalService.restore_ai_dynamic(node_id)

        from app.redis_client import redis_delete
        await redis_delete(corridor_key(corridor_id))
        await ConflictEngine.deregister(corridor_id)

        await AuditService.log(db, user.firebase_uid, corridor_id, "CORRIDOR_STOPPED", {
            "reason": reason or "user_terminated"
        })
        await ws_manager.broadcast_corridor(corridor_id, {
            "event": "CORRIDOR_STOPPED",
            "corridor_id": corridor_id,
        })
        return corridor

    @staticmethod
    async def get(corridor_id: str, db: AsyncSession) -> Optional[Corridor]:
        result = await db.execute(select(Corridor).where(Corridor.id == corridor_id))
        return result.scalar_one_or_none()
