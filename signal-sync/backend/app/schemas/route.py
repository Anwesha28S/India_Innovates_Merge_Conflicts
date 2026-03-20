from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class RouteCalculateRequest(BaseModel):
    origin_intersection_id: int
    dest_intersection_id: int
    consider_traffic: bool = True
    consider_signal_delay: bool = True
    vehicle_type: Optional[str] = "standard"  # ambulance / vvip / standard


class RouteNode(BaseModel):
    intersection_id: int
    name: str
    lat: float
    lng: float
    estimated_wait_sec: float = 0.0


class RouteCalculateResponse(BaseModel):
    path: List[RouteNode]
    total_distance_m: float
    estimated_duration_sec: float
    algorithm: str = "A*"


class TrafficWeight(BaseModel):
    intersection_id: int
    density_pct: int = Field(..., ge=0, le=100)
    signal_delay_sec: float = 0.0
