from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request, Response
from fastapi.responses import FileResponse, HTMLResponse
from app.routers.auth import get_current_user
from app.models.models import User, Project, ProjectAccess
from sqlalchemy.orm import Session
from typing import Optional
import os
import shutil
import zipfile
import urllib.parse
from app.core.database import get_db

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


def format_to_cst(dt):
    """将 UTC 时间转换为东八区时间字符串"""
    if dt is None:
        return None
    from datetime import timedelta
    cst_time = dt + timedelta(hours=8)
    return cst_time.strftime("%Y-%m-%d %H:%M:%S")


@router.get("")
def list_projects(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    author_id: Optional[int] = Query(None),
    project_type: Optional[str] = Query(None, description="my:我的项目, collaborate:协作项目"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取项目列表
    - search: 搜索项目名称
    - author_id: 筛选指定作者的项目
    - project_type: my=我的项目(我是作者), collaborate=协作项目(他人创建)
    """
    skip = (page - 1) * per_page
    
    # 构建查询
    from sqlalchemy import or_
    query = db.query(Project)
    
    # 搜索项目名称
    if search:
        query = query.filter(Project.name.ilike(f"%{search}%"))
    
    # 项目类型筛选
    if project_type == "my":
        # 我的项目：我是作者
        query = query.filter(Project.author_id == current_user.id)
    elif project_type == "collaborate":
        # 协作项目：他人创建但我有权限访问的
        query = query.filter(Project.author_id != current_user.id)
    
    # 指定作者筛选（用于协作项目下筛选特定作者）
    if author_id is not None:
        query = query.filter(Project.author_id == author_id)
    
    # 权限过滤（管理员看所有，其他人只能看公开+自己的+被授权的）
    if current_user.role != "admin":
        access_project_ids = db.query(ProjectAccess.project_id).filter(ProjectAccess.user_id == current_user.id).all()
        access_ids = [p[0] for p in access_project_ids]
        query = query.filter(
            or_(
                Project.is_public == True,
                Project.author_id == current_user.id,
                Project.id.in_(access_ids) if access_ids else False
            )
        )
    
    # 排序和分页
    total = query.count()
    projects = query.order_by(Project.updated_at.desc()).offset(skip).limit(per_page).all()
    
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
            "remark": project.remark,
            "created_at": format_to_cst(project.created_at),
            "updated_at": format_to_cst(project.updated_at),
            "can_access": True
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
    remark: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not can_upload(current_user):
        raise HTTPException(status_code=403, detail="只有管理员和产品经理可以上传原型")
    
    # 创建项目记录
    project_data = ProjectCreate(
        name=name,
        view_password=view_password,
        is_public=is_public,
        remark=remark
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
    request: Request,
    db: Session = Depends(get_db)
):
    """访问原型首页（返回 start.html）- 无需登录，公开原型可直接访问，密码保护原型需验证密码"""
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
    # 检查是否需要密码验证
    if not project.is_public:
        # 检查是否已通过密码验证（通过 cookie）
        verified = request.cookies.get(f"project_access_{object_id}")
        if verified != "1":
            # 需要密码验证，返回密码输入页面
            return HTMLResponse(content=get_password_verify_page(object_id, project.name))
    
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
    request: Request,
    db: Session = Depends(get_db)
):
    """访问原型的静态资源文件 - 无需登录"""
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
    # 检查是否需要密码验证
    if not project.is_public:
        verified = request.cookies.get(f"project_access_{object_id}")
        if verified != "1":
            raise HTTPException(status_code=403, detail="需要密码验证")
    
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


def get_password_verify_page(object_id: str, project_name: str) -> str:
    """获取密码验证页面的 HTML"""
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>输入密码 - {project_name}</title>
    <script src="/static/js/tailwindcss.js"></script>
    <link href="/static/css/inter-font.css" rel="stylesheet">
    <style>body {{ font-family: 'Inter', sans-serif; }}</style>
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center">
    <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4">
        <div class="text-center mb-6">
            <div class="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
            </div>
            <h1 class="text-xl font-bold text-gray-900">{project_name}</h1>
            <p class="text-gray-500 mt-2 text-sm">此原型需要密码才能访问</p>
        </div>
        
        <form id="verifyForm" class="space-y-4">
            <div>
                <input type="password" id="password" required
                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-center text-lg tracking-widest"
                    placeholder="请输入访问密码"
                    autocomplete="off">
            </div>
            <button type="submit" id="submitBtn"
                class="w-full py-3 px-4 bg-gradient-to-r from-orange-600 to-orange-500 text-white font-medium rounded-lg hover:from-orange-700 hover:to-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-all">
                验证密码
            </button>
        </form>
        
        <div id="message" class="mt-4 text-center text-sm hidden"></div>
    </div>
    
    <script>
        document.getElementById('verifyForm').addEventListener('submit', async (e) => {{
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            const msg = document.getElementById('message');
            
            btn.disabled = true;
            btn.textContent = '验证中...';
            msg.className = 'mt-4 text-center text-sm hidden';
            
            try {{
                const response = await fetch('/api/projects/{object_id}/verify-public', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{ password: document.getElementById('password').value }})
                }});
                
                if (response.ok) {{
                    // 验证成功，刷新页面
                    window.location.reload();
                }} else {{
                    const data = await response.json();
                    msg.textContent = data.detail || '密码错误';
                    msg.className = 'mt-4 text-center text-sm text-red-600';
                    msg.classList.remove('hidden');
                }}
            }} catch (error) {{
                msg.textContent = '网络错误，请重试';
                msg.className = 'mt-4 text-center text-sm text-red-600';
                msg.classList.remove('hidden');
            }}
            
            btn.disabled = false;
            btn.textContent = '验证密码';
        }});
    </script>
</body>
</html>'''


@router.post("/{object_id}/verify-public")
def verify_project_password_public(
    object_id: str,
    verify_data: ProjectVerifyRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """公开访问时的密码验证 - 无需登录，验证成功后设置 cookie"""
    project = ProjectService.get_by_object_id(db, object_id)
    if not project:
        raise HTTPException(status_code=404, detail="原型不存在")
    
    if not ProjectService.verify_password(project, verify_data.password):
        raise HTTPException(status_code=401, detail="密码错误")
    
    # 设置 cookie，标记已验证（7天有效期）
    response.set_cookie(
        key=f"project_access_{object_id}",
        value="1",
        max_age=60 * 60 * 24 * 7,  # 7天
        httponly=True,
        samesite="lax"
    )
    
    return {"message": "验证成功", "object_id": object_id}
