"""
健康检查路由
提供 REST API 标准健康检查端点，供 CLI 和监控使用
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db

router = APIRouter(tags=["健康检查"])

# API 版本号
API_VERSION = "1.0.0"


@router.get("/api/health")
async def health_check(db: Session = Depends(get_db)):
    """
    健康检查端点 - 供 CLI 和监控使用
    
    Returns:
        {
            "status": "ok",
            "timestamp": "2025-03-14T10:30:00",
            "version": "1.0.0",
            "services": {
                "database": "ok",
                "storage": "ok"
            }
        }
    """
    services = {
        "database": "ok",
        "storage": "ok"
    }
    
    # 检查数据库连接
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        services["database"] = "error"
        raise HTTPException(
            status_code=503,
            detail={
                "status": "error",
                "timestamp": datetime.now().isoformat(),
                "version": API_VERSION,
                "services": services
            }
        )
    
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": API_VERSION,
        "services": services
    }
