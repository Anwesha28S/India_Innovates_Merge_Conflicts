from typing import Optional
from pydantic import BaseModel, Field
from app.models.intersection import SignalState


class SignalOverrideRequest(BaseModel):
    intersection_id: int
    new_state: SignalState
    green_duration_sec: Optional[int] = Field(default=30, ge=3, le=180)
    reason: str = "manual_override"


class SignalScheduleRequest(BaseModel):
    """Schedule a timed green phase for a green corridor node."""
    intersection_id: int
    corridor_id: str
    green_start_offset_sec: int = Field(..., ge=0, description="Seconds from now to start green")
    green_duration_sec: int = Field(default=30, ge=5, le=120)


class SignalStateOut(BaseModel):
    intersection_id: int
    state: str
    green_duration_sec: Optional[int] = None
    corridor_id: Optional[str] = None
    updated_at: Optional[str] = None
