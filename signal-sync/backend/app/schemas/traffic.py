from typing import List, Dict
from pydantic import BaseModel, Field


class TrafficUpdateRequest(BaseModel):
    intersection_id: int
    density_pct: int = Field(..., ge=0, le=100)
    vehicle_count: int = Field(default=0, ge=0)
    source: str = "camera"   # "camera" | "manual" | "sensor"


class TrafficStateOut(BaseModel):
    intersection_id: int
    density_pct: int
    vehicle_count: int
    signal_state: str
    updated_at: str


class TrafficLiveResponse(BaseModel):
    intersections: List[TrafficStateOut]
