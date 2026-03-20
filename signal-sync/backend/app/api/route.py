from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.route import RouteCalculateRequest, RouteCalculateResponse
from app.services.routing_engine import RoutingEngine

router = APIRouter(prefix="/route", tags=["route"])


@router.post("/calculate", response_model=RouteCalculateResponse)
async def calculate_route(
    req: RouteCalculateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Run A* on the intersection graph with live traffic + signal weights.
    Any authenticated user may call this endpoint.
    """
    try:
        result = await RoutingEngine.calculate(
            origin_id=req.origin_intersection_id,
            dest_id=req.dest_intersection_id,
            vehicle_type=req.vehicle_type or "standard",
            consider_traffic=req.consider_traffic,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
