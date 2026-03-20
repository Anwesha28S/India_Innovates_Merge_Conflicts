from typing import Literal
from pydantic import BaseModel, Field


class VisionAlertRequest(BaseModel):
    intersection_id: int
    vehicle_type: Literal["ambulance", "fire_truck"]
    confidence: float = Field(..., ge=0.0, le=1.0)
    direction: str = Field(..., description="e.g. 'north', 'east-bound'")
    camera_id: str = "CAM-UNKNOWN"


class VisionAlertResponse(BaseModel):
    processed: bool
    action_taken: str   # "OVERRIDE_TRIGGERED" | "BELOW_THRESHOLD" | "ALREADY_ACTIVE"
    intersection_id: int
    new_signal_state: str
