from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.models import User
from app.schemas.schemas import (
    UserCreate, UserUpdate, UserResponse, 
    ProjectCreate, ProjectUpdate, ProjectResponse, 
    ProjectListResponse, ProjectVerifyRequest
)
from app.services.services import UserService, ProjectService
from app.core.security import get_password_hash
from datetime import timedelta


def format_to_cst(dt):
    """将 UTC 时间转换为东八区时间字符串"""
    if dt is None:
        return None
    cst_time = dt + timedelta(hours=8)
    return cst_time.strftime("%Y-%m-%d %H:%M:%S")


class ChangePasswordRequest(BaseModel):
    password: str

router = APIRouter(prefix="/api/users", tags=["用户管理"])

# 简化的用户响应（用于下拉选择）
class UserOptionResponse(BaseModel):
    id: int
    name: str
    employee_id: str
    
    class Config:
        from_attributes = True


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user


@router.get("")
def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str = Query(""),
    status: str = Query(""),
    role: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """获取用户列表，支持搜索和筛选"""
    from sqlalchemy import or_
    
    query = db.query(User)
    
    # 搜索姓名或工号
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                User.name.ilike(search_pattern),
                User.employee_id.ilike(search_pattern)
            )
        )
    
    # 状态筛选
    if status:
        query = query.filter(User.status == status)
    
    # 角色筛选
    if role:
        query = query.filter(User.role == role)
    
    # 分页
    total = query.count()
    skip = (page - 1) * per_page
    users = query.offset(skip).limit(per_page).all()
    
    # 格式化响应
    result = []
    for user in users:
        result.append({
            "id": user.id,
            "name": user.name,
            "employee_id": user.employee_id,
            "role": user.role,
            "status": user.status,
            "created_at": format_to_cst(user.created_at) if hasattr(user, 'created_at') else ""
        })
    
    return {
        "items": result,
        "total": total,
        "page": page,
        "per_page": per_page
    }


@router.get("/options", response_model=List[UserOptionResponse])
def list_user_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取活跃用户列表（用于下拉选择）"""
    from sqlalchemy import or_
    users = db.query(User).filter(User.status == "active").all()
    return users


@router.post("", response_model=UserResponse)
def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    # 检查工号是否已存在
    existing = UserService.get_by_employee_id(db, user_data.employee_id)
    if existing:
        raise HTTPException(status_code=400, detail="工号已存在")
    
    return UserService.create(db, user_data)


@router.get("/{user_id}")
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """获取单个用户信息"""
    user = UserService.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return {
        "id": user.id,
        "name": user.name,
        "employee_id": user.employee_id,
        "role": user.role,
        "status": user.status,
        "created_at": format_to_cst(user.created_at) if hasattr(user, 'created_at') else None
    }


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    user = UserService.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return UserService.update(db, user, user_data)


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    user = UserService.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    UserService.delete(db, user)
    return {"message": "用户已删除"}


@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """当前用户修改自己的密码（无需验证原密码）"""
    # 验证密码长度
    if len(data.password) < 6 or len(data.password) > 18:
        raise HTTPException(status_code=400, detail="密码长度需在6-18位之间")
    
    # 直接更新密码
    current_user.password_hash = get_password_hash(data.password)
    db.commit()
    
    return {"message": "密码修改成功"}
