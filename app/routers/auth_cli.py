"""
CLI 登录支持路由
为 AxHost CLI 工具提供自动回调登录功能
"""

import json
import secrets
from datetime import timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token
from app.routers.auth import get_current_user

router = APIRouter(tags=["CLI 认证"])

# 允许的回调地址主机名（仅允许本地地址）
ALLOWED_CALLBACK_HOSTS = ('127.0.0.1', 'localhost', '::1')

# CLI Token 有效期（30天）
CLI_TOKEN_EXPIRE_DAYS = 30

# 登录状态 cookie 有效期（5分钟，以秒为单位）
CLI_AUTH_STATE_EXPIRE_SECONDS = 300


def validate_callback(callback: str) -> bool:
    """验证 callback 地址安全性
    
    只允许 localhost/127.0.0.1/::1 地址，且必须指定端口
    """
    try:
        parsed = urlparse(callback)
        return (
            parsed.hostname in ALLOWED_CALLBACK_HOSTS
            and parsed.scheme in ('http', 'https')
            and parsed.port is not None  # 必须指定端口
        )
    except Exception:
        return False


def create_cli_token(user_id: int) -> str:
    """生成 CLI 专用 Token
    
    复用现有的 create_access_token，添加 type 标记用于区分
    """
    return create_access_token(
        data={"sub": str(user_id), "type": "cli"},
        expires_delta=timedelta(days=CLI_TOKEN_EXPIRE_DAYS)
    )


async def get_current_user_optional(request: Request, db: Session = Depends(get_db)):
    """获取当前用户（可选，未登录返回 None）"""
    from app.routers.auth import decode_token
    
    token = request.cookies.get("access_token")
    
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
    
    if not token:
        return None
    
    payload = decode_token(token)
    if not payload:
        return None
    
    user_id = payload.get("sub")
    if not user_id:
        return None
    
    from app.services.services import UserService
    user = UserService.get_by_id(db, int(user_id))
    if not user or user.status != "active":
        return None
    
    return user


@router.get("/auth/cli-login")
async def cli_login(
    callback: str,
    state: str,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """CLI 登录入口
    
    1. 验证 callback 必须是 localhost（安全限制）
    2. 检查用户当前登录状态（通过 Cookie）
    3. 已登录：生成 CLI Token，重定向回 CLI
    4. 未登录：显示登录页，登录后重定向
    """
    # 验证参数
    if not callback or not state:
        raise HTTPException(400, "Missing callback or state parameter")
    
    if not validate_callback(callback):
        raise HTTPException(400, "Invalid callback URL. Only localhost addresses are allowed.")
    
    # 检查登录状态
    user = await get_current_user_optional(request, db)
    
    if user:
        # 已登录：直接生成 Token 并重定向
        token = create_cli_token(user.id)
        redirect_url = f"{callback}?token={token}&state={state}"
        return RedirectResponse(redirect_url)
    else:
        # 未登录：保存状态到 cookie，重定向到登录页
        auth_data = {
            "callback": callback,
            "state": state,
            "nonce": secrets.token_urlsafe(16)  # 额外随机数防篡改
        }
        response.set_cookie(
            key="cli_auth_state",
            value=json.dumps(auth_data),
            max_age=CLI_AUTH_STATE_EXPIRE_SECONDS,
            httponly=True,
            secure=False,  # 允许 HTTP（开发环境）
            samesite="lax"
        )
        return RedirectResponse(f"/login?next=/auth/cli-callback")


@router.get("/auth/cli-callback")
async def cli_callback(
    request: Request,
    response: Response,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """用户完成 Web 登录后的回调
    
    从 cookie 中读取之前保存的 callback/state，生成 CLI Token 并重定向
    """
    auth_cookie = request.cookies.get("cli_auth_state")
    if not auth_cookie:
        raise HTTPException(400, "Auth state expired or invalid. Please try again.")
    
    try:
        auth_data = json.loads(auth_cookie)
        callback = auth_data["callback"]
        state = auth_data["state"]
    except (json.JSONDecodeError, KeyError):
        raise HTTPException(400, "Invalid auth state. Please try again.")
    
    # 再次验证 callback 安全性
    if not validate_callback(callback):
        raise HTTPException(400, "Invalid callback URL.")
    
    # 生成 CLI Token
    token = create_cli_token(current_user.id)
    
    # 清除临时 cookie 并重定向
    redirect_url = f"{callback}?token={token}&state={state}"
    response = RedirectResponse(redirect_url)
    response.delete_cookie("cli_auth_state")
    
    return response
