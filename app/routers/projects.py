from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session
from typing import Optional
import os
import shutil
import zipfile
import urllib.parse
from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.models import User
from app.schemas.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, 
    ProjectListResponse, ProjectVerifyRequest, ChangeAuthorRequest
)
from app.services.services import ProjectService, UserService, generate_password

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

def is_admin(user: User):
    """检查用户是否为管理员"""
    return user.role == "admin"

def decode_zip_filename(filename: str) -> str:
    """
    更稳健的 ZIP 文件名解码逻辑
    """
    try:
        # 1. 尝试将 zipfile 默认的 cp437 编码还原为原始字节，再用 gbk 解码
        # 这是处理 Windows 中文压缩包最有效的方法
        return filename.encode('cp437').decode('gbk')
    except (UnicodeEncodeError, UnicodeDecodeError):
        try:
            # 2. 如果失败，尝试 UTF-8 解码（处理本身就是 UTF-8 但被错误处理的情况）
            return filename.encode('utf-8').decode('utf-8')
        except:
            # 3. 万不得已返回原样
            return filename


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
            temp_extract_dir = os.path.join(project_dir, '_temp_extract')
            os.makedirs(temp_extract_dir, exist_ok=True)
            
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                for info in zip_ref.infolist():
                    # 关键修改：直接对 info.filename 进行解码
                    # zipfile 的 info.filename 已经是被它用 cp437 解码后的字符串了
                    decoded_name = decode_zip_filename(info.filename)
                    
                    # 过滤 macOS 自动生成的缓存文件夹
                    if "__MACOSX" in decoded_name or ".DS_Store" in decoded_name:
                        continue

                    target_path = os.path.join(temp_extract_dir, decoded_name)
                    
                    # 安全检查
                    if not os.path.realpath(target_path).startswith(os.path.realpath(temp_extract_dir)):
                        continue
                    
                    if info.is_dir():
                        os.makedirs(target_path, exist_ok=True)
                    else:
                        os.makedirs(os.path.dirname(target_path), exist_ok=True)
                        with zip_ref.open(info.filename) as source, open(target_path, 'wb') as target:
                            shutil.copyfileobj(source, target)
            
            # 删除 zip 文件
            os.remove(file_path)
            
            # 查找包含入口文件的目录
            entry_dir = find_entry_directory(temp_extract_dir)
            
            if entry_dir is None:
                # 没有找到入口文件，删除临时目录和项目
                shutil.rmtree(temp_extract_dir)
                if os.path.exists(project_dir):
                    shutil.rmtree(project_dir)
                ProjectService.delete(db, project)
                raise HTTPException(status_code=400, detail="上传的压缩包中未找到入口文件")
            
            # 将入口目录下的所有文件复制到 project_dir
            for item in os.listdir(entry_dir):
                src = os.path.join(entry_dir, item)
                dst = os.path.join(project_dir, item)
                if os.path.exists(dst):
                    if os.path.isdir(dst):
                        shutil.rmtree(dst)
                    else:
                        os.remove(dst)
                shutil.move(src, dst)
            
            # 删除临时目录
            shutil.rmtree(temp_extract_dir)
            
        except zipfile.BadZipFile:
            if os.path.exists(file_path):
                os.remove(file_path)
            if os.path.exists(project_dir):
                shutil.rmtree(project_dir)
            ProjectService.delete(db, project)
            raise HTTPException(status_code=400, detail="无效的压缩文件")
    
    return {"message": "上传成功", "object_id": project.object_id}


def find_entry_directory(extract_dir: str) -> Optional[str]:
    """
    查找包含入口文件的目录
    1. 检查 extract_dir 下是否同时存在 index.html 和 start.html 文件，若存在，返回 extract_dir
    2. 若没有找到，则递归遍历其下所有目录，找到同时包含 index.html 和 start.html 的目录，返回该目录
    3. 若第 2 步没有找到符合条件的目录，返回 None
    """
    def has_entry_files(directory: str) -> bool:
        """检查目录是否同时包含 index.html 和 start.html"""
        has_index = os.path.isfile(os.path.join(directory, 'index.html'))
        has_start = os.path.isfile(os.path.join(directory, 'start.html'))
        return has_index and has_start
    
    # 第 1 步：检查根目录
    if has_entry_files(extract_dir):
        return extract_dir
    
    # 第 2 步：递归遍历所有子目录
    for root, dirs, files in os.walk(extract_dir):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != '__MACOSX']
        if has_entry_files(root):
            return root
    
    # 第 3 步：没有找到符合条件的目录
    return None

@router.get("/{object_id}", response_model=ProjectResponse)
def get_project(
    object_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
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
    
    if not ProjectService.verify_password(project, verify_data.password):
        raise HTTPException(status_code=401, detail="密码错误")
    
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
    
    project_dir = os.path.join(UPLOAD_DIR, project.object_id)
    if os.path.exists(project_dir):
        shutil.rmtree(project_dir)
    
    ProjectService.delete(db, project)
    return {"message": "删除成功"}


@router.post("/{object_id}/update-file")
def update_project_file(
    object_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新原型文件（覆盖原有文件）"""
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
    if not can_manage(project, current_user):
        raise HTTPException(status_code=403, detail="只有作者或管理员可以更新原型")
    
    project_dir = os.path.join(UPLOAD_DIR, project.object_id)
    
    # 清空原有目录内容
    if os.path.exists(project_dir):
        for item in os.listdir(project_dir):
            item_path = os.path.join(project_dir, item)
            if os.path.isdir(item_path):
                shutil.rmtree(item_path)
            else:
                os.remove(item_path)
    else:
        os.makedirs(project_dir, exist_ok=True)
    
    # 保存新文件
    file_path = os.path.join(project_dir, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # 如果是 zip 文件，自动解压
    if file.filename and file.filename.lower().endswith('.zip'):
        try:
            temp_extract_dir = os.path.join(project_dir, '_temp_extract')
            os.makedirs(temp_extract_dir, exist_ok=True)
            
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                for info in zip_ref.infolist():
                    decoded_name = decode_zip_filename(info.filename)
                    
                    if "__MACOSX" in decoded_name or ".DS_Store" in decoded_name:
                        continue

                    target_path = os.path.join(temp_extract_dir, decoded_name)
                    
                    if not os.path.realpath(target_path).startswith(os.path.realpath(temp_extract_dir)):
                        continue
                    
                    if info.is_dir():
                        os.makedirs(target_path, exist_ok=True)
                    else:
                        os.makedirs(os.path.dirname(target_path), exist_ok=True)
                        with zip_ref.open(info.filename) as source, open(target_path, 'wb') as target:
                            shutil.copyfileobj(source, target)
            
            # 删除 zip 文件
            os.remove(file_path)
            
            # 查找包含入口文件的目录
            entry_dir = find_entry_directory(temp_extract_dir)
            
            if entry_dir is None:
                shutil.rmtree(temp_extract_dir)
                raise HTTPException(status_code=400, detail="上传的压缩包中未找到入口文件")
            
            # 将入口目录下的所有文件复制到 project_dir
            for item in os.listdir(entry_dir):
                src = os.path.join(entry_dir, item)
                dst = os.path.join(project_dir, item)
                if os.path.exists(dst):
                    if os.path.isdir(dst):
                        shutil.rmtree(dst)
                    else:
                        os.remove(dst)
                shutil.move(src, dst)
            
            # 删除临时目录
            shutil.rmtree(temp_extract_dir)
            
        except zipfile.BadZipFile:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(status_code=400, detail="无效的压缩文件")
    
    # 更新项目更新时间
    ProjectService.touch(db, project)
    
    return {"message": "更新成功"}


@router.put("/{object_id}/change-author")
def change_project_author(
    object_id: str,
    data: ChangeAuthorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更改原型作者（仅管理员）"""
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="只有管理员可以更改作者")
    
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
    # 检查新作者是否存在且状态正常
    new_author = UserService.get_by_id(db, data.new_author_id)
    if not new_author:
        raise HTTPException(status_code=404, detail="新作者不存在")
    if new_author.status != "active":
        raise HTTPException(status_code=400, detail="新作者账户状态异常")
    
    ProjectService.change_author(db, project, data.new_author_id)
    return {"message": "作者更改成功"}

@router.post("/generate-password")
def generate_random_password():
    """生成随机密码"""
    return {"password": generate_password(6)}


def find_start_file(project_dir: str) -> Optional[str]:
    """查找 Axure 原型的起始 HTML 文件"""
    start_files = ['start.html', 'index.html', 'home.html', 'Start.html', 'Index.html']
    
    for filename in start_files:
        filepath = os.path.join(project_dir, filename)
        if os.path.exists(filepath):
            return filepath
    
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
    
    if not ProjectService.can_access(db, project, current_user):
        raise HTTPException(status_code=403, detail="没有访问权限")
    
    project_dir = os.path.join(UPLOAD_DIR, project.object_id)
    
    if not os.path.exists(project_dir) or not os.listdir(project_dir):
        raise HTTPException(status_code=404, detail="原型文件尚未上传")
    
    start_file = find_start_file(project_dir)
    if not start_file:
        raise HTTPException(status_code=404, detail="未找到可预览的 HTML 文件")
    
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
    
    if not ProjectService.can_access(db, project, current_user):
        raise HTTPException(status_code=403, detail="没有访问权限")
    
    project_dir = os.path.join(UPLOAD_DIR, project.object_id)
    
    # URL解码 filepath，处理中文文件名
    decoded_filepath = urllib.parse.unquote(filepath)
    
    file_path = os.path.join(project_dir, decoded_filepath)
    
    # 安全检查
    real_file_path = os.path.realpath(file_path)
    real_project_dir = os.path.realpath(project_dir)
    if not real_file_path.startswith(real_project_dir):
        raise HTTPException(status_code=403, detail="非法路径")
    
    if not os.path.exists(file_path) or os.path.isdir(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return FileResponse(file_path)
