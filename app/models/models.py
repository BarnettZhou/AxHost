from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import uuid

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    employee_id = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # admin, product_manager, developer
    status = Column(String(20), default="active")  # active, inactive
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 关系
    projects = relationship("Project", back_populates="author", foreign_keys="Project.author_id")
    access_records = relationship("ProjectAccess", back_populates="user", foreign_keys="ProjectAccess.user_id")

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    object_id = Column(String(36), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"))
    view_password = Column(String(18))  # 明文存储
    is_public = Column(Boolean, default=False)
    remark = Column(Text, nullable=True)  # 备注字段
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    author = relationship("User", back_populates="projects", foreign_keys=[author_id])
    access_records = relationship("ProjectAccess", back_populates="project", foreign_keys="ProjectAccess.project_id", cascade="all, delete-orphan")

class ProjectAccess(Base):
    __tablename__ = "project_access"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    accessed_at = Column(DateTime, default=datetime.utcnow)
    
    # 关系
    project = relationship("Project", back_populates="access_records", foreign_keys=[project_id])
    user = relationship("User", back_populates="access_records", foreign_keys=[user_id])
