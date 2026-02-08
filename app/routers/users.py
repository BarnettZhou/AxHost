from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.models import User
from app.schemas.schemas import (
    UserCreate, UserUpdate, UserResponse, 
    ProjectCreate, ProjectUpdate, ProjectResponse, 
    ProjectListResponse, ProjectVerifyRequest
)
from app.services.services import UserService, ProjectService

router = APIRouter(prefix="/api/users", tags=["用户管理"])

def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user

@router.get("", response_model=List[UserResponse])
def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return UserService.list(db, skip=skip, limit=limit)

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
