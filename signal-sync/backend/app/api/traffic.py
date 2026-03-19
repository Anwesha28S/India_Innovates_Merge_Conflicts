from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.traffic import TrafficUpdateRequest, TrafficLiveResponse
from app.services.traffic_service import TrafficService

router = APIRouter(prefix="/traffic", tags=["traffic"])


@router.post("/update", status_code=204)
async def update_traffic(
    req: TrafficUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Push live traffic density for an intersection (from camera/sensor)."""
    await TrafficService.update(req, db)


@router.get("/live", response_model=TrafficLiveResponse)
async def live_traffic(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Returns live traffic + signal state for all active intersections."""
    return await TrafficService.get_live(db)
