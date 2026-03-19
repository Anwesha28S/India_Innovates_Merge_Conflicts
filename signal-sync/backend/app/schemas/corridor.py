from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.models.corridor import CorridorStatus, CorridorType


class NodeIn(BaseModel):
    intersection_id: int
    name: str
    lat: float
    lng: float


class CorridorCreateRequest(BaseModel):
    corridor_type: CorridorType = CorridorType.AMBULANCE
    origin_name: str
    dest_name: str
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    node_ids: List[int] = Field(..., min_length=1)
    node_snapshot: List[dict] = Field(default_factory=list)
    priority_level: int = Field(default=3, ge=1, le=4)


class CorridorStartRequest(BaseModel):
    corridor_id: str


class CorridorStopRequest(BaseModel):
    corridor_id: str
    reason: Optional[str] = None


class CorridorNodeOut(BaseModel):
    intersection_id: int
    name: str
    lat: float
    lng: float
    status: str = "pending"  # pending | active | completed

    class Config:
        from_attributes = True


class CorridorOut(BaseModel):
    id: str
    corridor_type: CorridorType
    status: CorridorStatus
    origin_name: str
    dest_name: str
    node_snapshot: List[dict]
    active_node_index: int
    priority_level: int
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
