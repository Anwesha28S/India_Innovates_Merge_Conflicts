from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog


class AuditService:

    @staticmethod
    async def log(
        db: AsyncSession,
        firebase_uid: Optional[str],
        corridor_id: Optional[str],
        action: str,
        detail: dict,
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        entry = AuditLog(
            firebase_uid=firebase_uid,
            corridor_id=corridor_id,
            action=action,
            detail=detail,
            ip_address=ip_address,
        )
        db.add(entry)
        await db.flush()
        return entry
