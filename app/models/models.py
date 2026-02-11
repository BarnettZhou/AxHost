from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

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
    tags = relationship("Tag", back_populates="creator", foreign_keys="Tag.creator_id")
    common_tags = relationship("UserCommonTag", back_populates="user", foreign_keys="UserCommonTag.user_id", cascade="all, delete-orphan")

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
    project_tags = relationship("ProjectTag", back_populates="project", foreign_keys="ProjectTag.project_id", cascade="all, delete-orphan")

class ProjectAccess(Base):
    __tablename__ = "project_access"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    accessed_at = Column(DateTime, default=datetime.utcnow)
    
    # 关系
    project = relationship("Project", back_populates="access_records", foreign_keys=[project_id])
    user = relationship("User", back_populates="access_records", foreign_keys=[user_id])


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(16), unique=True, nullable=False, index=True)
    emoji = Column(String(32), nullable=True)
    color = Column(String(7), nullable=False, default="#D3D3D3")
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    creator = relationship("User", back_populates="tags", foreign_keys=[creator_id])
    project_tags = relationship("ProjectTag", back_populates="tag", foreign_keys="ProjectTag.tag_id", cascade="all, delete-orphan")
    common_by_users = relationship("UserCommonTag", back_populates="tag", foreign_keys="UserCommonTag.tag_id", cascade="all, delete-orphan")


class ProjectTag(Base):
    __tablename__ = "project_tags"
    __table_args__ = (
        UniqueConstraint("project_id", "tag_id", name="uq_project_tags_project_tag"),
    )

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)

    project = relationship("Project", back_populates="project_tags", foreign_keys=[project_id])
    tag = relationship("Tag", back_populates="project_tags", foreign_keys=[tag_id])


class UserCommonTag(Base):
    __tablename__ = "user_common_tags"
    __table_args__ = (
        UniqueConstraint("user_id", "tag_id", name="uq_user_common_tags_user_tag"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="common_tags", foreign_keys=[user_id])
    tag = relationship("Tag", back_populates="common_by_users", foreign_keys=[tag_id])
