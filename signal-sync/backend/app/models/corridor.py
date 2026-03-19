import enum
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Enum, DateTime, Float, Integer,
    ForeignKey, JSON, Text, func
)
from sqlalchemy.orm import relationship
from app.database import Base


class CorridorStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED = "completed"
    ABORTED = "aborted"


class CorridorType(str, enum.Enum):
    AMBULANCE = "ambulance"
    FIRE_TRUCK = "fire_truck"
    VVIP = "vvip"


class Corridor(Base):
    __tablename__ = "corridors"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    firebase_uid = Column(String(128), ForeignKey("users.firebase_uid"), nullable=False)
    corridor_type = Column(Enum(CorridorType), nullable=False, default=CorridorType.AMBULANCE)
    status = Column(Enum(CorridorStatus), nullable=False, default=CorridorStatus.PENDING)

    # Route metadata
    origin_name = Column(String(255), nullable=False)
    dest_name = Column(String(255), nullable=False)
    origin_lat = Column(Float)
    origin_lng = Column(Float)
    dest_lat = Column(Float)
    dest_lng = Column(Float)

    # Ordered list of intersection IDs
    node_ids = Column(JSON, nullable=False, default=list)
    # Full node objects cached at creation (for display without extra joins)
    node_snapshot = Column(JSON, nullable=False, default=list)

    # Active node index for real-time tracking
    active_node_index = Column(Integer, default=0)

    # Priority for conflict resolution (lower = higher priority)
    priority_level = Column(Integer, default=3)  # 1=Critical Amb, 2=Fire, 3=Amb, 4=VVIP

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    creator = relationship("User", back_populates="corridors")
    audit_logs = relationship("AuditLog", back_populates="corridor")
