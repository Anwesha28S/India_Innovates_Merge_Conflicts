import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Enum, DateTime, Float, Integer,
    Boolean, func, JSON, Text
)
from sqlalchemy.orm import relationship
from app.database import Base


class UserRole(str, enum.Enum):
    PUBLIC_USER = "PUBLIC_USER"
    DISPATCHER = "DISPATCHER"
    ADMIN = "ADMIN"
    VVIP_AUTHORITY = "VVIP_AUTHORITY"


ROLE_LEVEL: dict[UserRole, int] = {
    UserRole.PUBLIC_USER: 0,
    UserRole.DISPATCHER: 1,
    UserRole.ADMIN: 2,
    UserRole.VVIP_AUTHORITY: 3,
}


class User(Base):
    __tablename__ = "users"

    firebase_uid = Column(String(128), primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    display_name = Column(String(255))
    role = Column(Enum(UserRole), nullable=False, default=UserRole.PUBLIC_USER)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_seen = Column(DateTime(timezone=True), onupdate=func.now())

    corridors = relationship("Corridor", back_populates="creator")
    audit_logs = relationship("AuditLog", back_populates="user")
