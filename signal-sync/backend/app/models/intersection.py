import enum
from sqlalchemy import (
    Column, Integer, String, Float, Enum, Boolean,
    ForeignKey, DateTime, func
)
from sqlalchemy.orm import relationship
from app.database import Base


class SignalState(str, enum.Enum):
    NORMAL = "NORMAL"
    AI_DYNAMIC = "AI_DYNAMIC"
    OVERRIDE = "OVERRIDE"
    GREEN_CORRIDOR = "GREEN_CORRIDOR"


class Intersection(Base):
    __tablename__ = "intersections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    city = Column(String(100), default="Mumbai")

    # Default timing (seconds)
    default_green = Column(Integer, default=30)
    default_yellow = Column(Integer, default=3)
    default_red = Column(Integer, default=30)

    has_camera = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Edges starting from this intersection
    roads_from = relationship("Road", foreign_keys="Road.from_intersection_id", back_populates="from_intersection")
    roads_to = relationship("Road", foreign_keys="Road.to_intersection_id", back_populates="to_intersection")


class Road(Base):
    """Directed graph edge between two intersections."""
    __tablename__ = "roads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    from_intersection_id = Column(Integer, ForeignKey("intersections.id"), nullable=False)
    to_intersection_id = Column(Integer, ForeignKey("intersections.id"), nullable=False)

    distance_m = Column(Float, nullable=False)      # metres
    speed_limit_kmh = Column(Integer, default=50)
    is_bidirectional = Column(Boolean, default=True)

    from_intersection = relationship("Intersection", foreign_keys=[from_intersection_id], back_populates="roads_from")
    to_intersection = relationship("Intersection", foreign_keys=[to_intersection_id], back_populates="roads_to")
