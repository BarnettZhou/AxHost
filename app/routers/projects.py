from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session
from typing import Optional
import os
import shutil
import zipfile
from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.models import User
from app.schemas.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, 
    ProjectListResponse, ProjectVerifyRequest
)
from app.services.services import ProjectService, generate_password

router = APIRouter(prefix="/api/projects", tags=["原型管理"])

# 页面路由（在 main.py 中注册，无 /api 前缀）
page_router = APIRouter(prefix="/projects", tags=["原型页面"])

# 上传目录（支持本地开发和 Docker）
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

def can_upload(user: User):
    """检查用户是否有上传权限"""
    return user.role in ["admin", "product_manager"]

def can_manage(project, user: User):
    """检查用户是否有管理权限"""
    return user.role == "admin" or project.author_id == user.id

@router.get("", response_model=ProjectListResponse)
def list_projects(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    skip = (page - 1) * per_page
    projects, total = ProjectService.list_accessible(db, current_user, skip, per_page, search)
    
    # 标记可访问状态
    result = []
    for project in projects:
        p_dict = {
            "id": project.id,
            "object_id": project.object_id,
            "name": project.name,
            "author_id": project.author_id,
            "author_name": project.author.name if project.author else "未知",
            "view_password": project.view_password,
            "is_public": project.is_public,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
            "can_access": True  # 已经在查询中过滤了
        }
        result.append(p_dict)
    
    return {
        "items": result,
        "total": total,
        "page": page,
        "per_page": per_page
    }

@router.post("")
def create_project(
    project_data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not can_upload(current_user):
        raise HTTPException(status_code=403, detail="只有管理员和产品经理可以上传原型")
    
    project = ProjectService.create(db, project_data, current_user.id)
    return {"message": "原型创建成功", "object_id": project.object_id}

@router.post("/upload")
def upload_project(
    file: UploadFile = File(...),
    name: str = Form(...),
    view_password: Optional[str] = Form(None),
    is_public: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not can_upload(current_user):
        raise HTTPException(status_code=403, detail="只有管理员和产品经理可以上传原型")
    
    # 创建项目记录
    project_data = ProjectCreate(
        name=name,
        view_password=view_password,
        is_public=is_public
    )
    project = ProjectService.create(db, project_data, current_user.id)
    
    # 保存文件
    project_dir = os.path.join(UPLOAD_DIR, project.object_id)
    os.makedirs(project_dir, exist_ok=True)
    
    file_path = os.path.join(project_dir, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # 如果是 zip 文件，自动解压
    if file.filename and file.filename.lower().endswith('.zip'):
        try:
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                # 检查是否有根目录
                namelist = zip_ref.namelist()
                if namelist:
                    # 获取第一个文件/目录的顶级路径
                    first_item = namelist[0]
                    top_level = first_item.split('/')[0] if '/' in first_item else ''
                    
                    # 如果所有文件都在一个根目录下，解压到该目录，否则解压到项目根
                    if top_level and all(name.startswith(top_level + '/') or name == top_level for name in namelist):
                        extract_dir = project_dir
                    else:
                        extract_dir = project_dir
                    
                    zip_ref.extractall(extract_dir)
            
            # 删除 zip 文件，节省空间
            os.remove(file_path)
            
        except zipfile.BadZipFile:
            pass  # 不是有效的 zip 文件，保留原文件
    
    return {"message": "上传成功", "object_id": project.object_id}

@router.get("/{object_id}", response_model=ProjectResponse)
def get_project(
    object_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
    # 检查访问权限
    if not ProjectService.can_access(db, project, current_user):
        raise HTTPException(status_code=403, detail="没有访问权限")
    
    return {
        "id": project.id,
        "object_id": project.object_id,
        "name": project.name,
        "author_id": project.author_id,
        "author_name": project.author.name if project.author else "未知",
        "view_password": project.view_password,
        "is_public": project.is_public,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "can_access": True
    }

@router.post("/{object_id}/verify")
def verify_project_password(
    object_id: str,
    verify_data: ProjectVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
    # 验证密码
    if not ProjectService.verify_password(project, verify_data.password):
        raise HTTPException(status_code=401, detail="密码错误")
    
    # 授权访问
    ProjectService.grant_access(db, project.id, current_user.id)
    
    return {"message": "验证成功", "object_id": object_id}

@router.put("/{object_id}")
def update_project(
    object_id: str,
    project_data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
    if not can_manage(project, current_user):
        raise HTTPException(status_code=403, detail="只有作者或管理员可以修改")
    
    # 如果修改了密码，撤销所有访问权限
    if project_data.view_password is not None and project_data.view_password != project.view_password:
        ProjectService.revoke_access(db, project)
    
    ProjectService.update(db, project, project_data)
    return {"message": "更新成功"}

@router.delete("/{object_id}")
def delete_project(
    object_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
    if not can_manage(project, current_user):
        raise HTTPException(status_code=403, detail="只有作者或管理员可以删除")
    
    # 删除文件
    project_dir = os.path.join(UPLOAD_DIR, project.object_id)
    if os.path.exists(project_dir):
        shutil.rmtree(project_dir)
    
    ProjectService.delete(db, project)
    return {"message": "删除成功"}

@router.post("/generate-password")
def generate_random_password():
    """生成随机密码"""
    return {"password": generate_password(6)}


def find_start_file(project_dir: str) -> Optional[str]:
    """查找 Axure 原型的起始 HTML 文件"""
    # 常见入口文件
    start_files = ['start.html', 'index.html', 'home.html', 'Start.html', 'Index.html']
    
    # 先在根目录找
    for filename in start_files:
        filepath = os.path.join(project_dir, filename)
        if os.path.exists(filepath):
            return filepath
    
    # 递归查找任何 HTML 文件
    for root, dirs, files in os.walk(project_dir):
        for filename in files:
            if filename.lower().endswith('.html'):
                return os.path.join(root, filename)
    
    return None


@page_router.get("/{object_id}/")
def view_project(
    object_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """访问原型首页（返回 start.html）"""
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
    # 检查访问权限
    if not ProjectService.can_access(db, project, current_user):
        raise HTTPException(status_code=403, detail="没有访问权限")
    
    project_dir = os.path.join(UPLOAD_DIR, project.object_id)
    
    # 如果目录不存在或为空，返回提示
    if not os.path.exists(project_dir) or not os.listdir(project_dir):
        raise HTTPException(status_code=404, detail="原型文件尚未上传")
    
    # 查找入口 HTML 文件
    start_file = find_start_file(project_dir)
    if not start_file:
        raise HTTPException(status_code=404, detail="未找到可预览的 HTML 文件")
    
    # 直接返回文件（不注入 base 标签，让资源使用相对路径）
    return FileResponse(start_file)


@page_router.get("/{object_id}/{filepath:path}")
def serve_project_file(
    object_id: str,
    filepath: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """访问原型的静态资源文件"""
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
    # 检查访问权限
    if not ProjectService.can_access(db, project, current_user):
        raise HTTPException(status_code=403, detail="没有访问权限")
    
    project_dir = os.path.join(UPLOAD_DIR, project.object_id)
    file_path = os.path.join(project_dir, filepath)
    
    # 安全检查：确保文件在项目目录内
    real_file_path = os.path.realpath(file_path)
    real_project_dir = os.path.realpath(project_dir)
    if not real_file_path.startswith(real_project_dir):
        raise HTTPException(status_code=403, detail="非法路径")
    
    if not os.path.exists(file_path) or os.path.isdir(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return FileResponse(file_path)
