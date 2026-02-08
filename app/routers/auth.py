from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import create_access_token, decode_token, verify_password
from app.schemas.schemas import LoginRequest, TokenResponse, UserResponse
from app.services.services import UserService

router = APIRouter(prefix="/api/auth", tags=["认证"])
security = HTTPBearer(auto_error=False)

def get_current_user(request: Request, db: Session = Depends(get_db)):
    """从 Cookie 或 Header 获取当前用户"""
    token = None
    
    # 优先从 Cookie 获取
    token = request.cookies.get("access_token")
    
    # 如果没有，从 Authorization Header 获取
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
    
    if not token:
        raise HTTPException(status_code=401, detail="未登录")
    
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="登录已过期")
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="无效的登录信息")
    
    user = UserService.get_by_id(db, int(user_id))
    if not user or user.status != "active":
        raise HTTPException(status_code=401, detail="用户已停用")
    
    return user

@router.post("/login", response_model=TokenResponse)
def login(response: Response, login_data: LoginRequest, db: Session = Depends(get_db)):
    user = UserService.get_by_employee_id(db, login_data.employee_id)
    if not user:
        raise HTTPException(status_code=401, detail="工号或密码错误")
    
    if not verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="工号或密码错误")
    
    access_token = create_access_token(data={"sub": str(user.id)})
    
    # 设置 Cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=30 * 24 * 60 * 60,  # 30天
        samesite="lax"
    )
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.from_orm(user)
    )

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "已退出登录"}

@router.get("/me", response_model=UserResponse)
def get_me(current_user = Depends(get_current_user)):
    return current_user
