import secrets
import string
from typing import Optional
from sqlalchemy.orm import Session
from app.models.models import User, Project, ProjectAccess
from app.schemas.schemas import UserCreate, UserUpdate, ProjectCreate, ProjectUpdate
from app.core.security import get_password_hash, verify_password

def generate_object_id() -> str:
    """生成唯一的 object_id"""
    import uuid
    from datetime import datetime
    return f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}"

def generate_password(length: int = 6) -> str:
    """生成随机密码（数字+字母）"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

# 用户服务
class UserService:
    @staticmethod
    def get_by_employee_id(db: Session, employee_id: str) -> Optional[User]:
        return db.query(User).filter(User.employee_id == employee_id, User.status == "active").first()
    
    @staticmethod
    def get_by_id(db: Session, user_id: int) -> Optional[User]:
        return db.query(User).filter(User.id == user_id).first()
    
    @staticmethod
    def create(db: Session, user_data: UserCreate) -> User:
        db_user = User(
            name=user_data.name,
            employee_id=user_data.employee_id,
            password_hash=get_password_hash(user_data.password),
            role=user_data.role,
            status=user_data.status
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    
    @staticmethod
    def update(db: Session, user: User, user_data: UserUpdate) -> User:
        if user_data.name:
            user.name = user_data.name
        if user_data.role:
            user.role = user_data.role
        if user_data.status:
            user.status = user_data.status
        if user_data.password:
            user.password_hash = get_password_hash(user_data.password)
        db.commit()
        db.refresh(user)
        return user
    
    @staticmethod
    def delete(db: Session, user: User):
        db.delete(user)
        db.commit()
    
    @staticmethod
    def list(db: Session, skip: int = 0, limit: int = 100):
        return db.query(User).offset(skip).limit(limit).all()

# 项目服务
class ProjectService:
    @staticmethod
    def get_by_object_id(db: Session, object_id: str) -> Optional[Project]:
        return db.query(Project).filter(Project.object_id == object_id).first()
    
    @staticmethod
    def create(db: Session, project_data: ProjectCreate, author_id: int) -> Project:
        db_project = Project(
            object_id=generate_object_id(),
            name=project_data.name,
            author_id=author_id,
            view_password=project_data.view_password,
            is_public=project_data.is_public
        )
        db.add(db_project)
        db.commit()
        db.refresh(db_project)
        return db_project
    
    @staticmethod
    def update(db: Session, project: Project, project_data: ProjectUpdate) -> Project:
        if project_data.name is not None:
            project.name = project_data.name
        if project_data.view_password is not None:
            project.view_password = project_data.view_password
        if project_data.is_public is not None:
            project.is_public = project_data.is_public
        db.commit()
        db.refresh(project)
        return project
    
    @staticmethod
    def delete(db: Session, project: Project):
        db.delete(project)
        db.commit()
    
    @staticmethod
    def list_accessible(db: Session, user: User, skip: int = 0, limit: int = 10, search: str = ""):
        """获取用户可访问的项目列表"""
        from sqlalchemy import or_
        
        query = db.query(Project)
        
        # 管理员可以看所有
        if user.role == "admin":
            pass
        # 产品经理可以看公开的 + 自己的 + 被授权的
        elif user.role == "product_manager":
            access_project_ids = db.query(ProjectAccess.project_id).filter(ProjectAccess.user_id == user.id).all()
            access_ids = [p[0] for p in access_project_ids]
            query = query.filter(
                or_(
                    Project.is_public == True,
                    Project.author_id == user.id,
                    Project.id.in_(access_ids) if access_ids else False
                )
            )
        # 开发者只能看公开的 + 被授权的
        else:
            access_project_ids = db.query(ProjectAccess.project_id).filter(ProjectAccess.user_id == user.id).all()
            access_ids = [p[0] for p in access_project_ids]
            query = query.filter(
                or_(
                    Project.is_public == True,
                    Project.id.in_(access_ids) if access_ids else False
                )
            )
        
        # 搜索
        if search:
            query = query.filter(Project.name.ilike(f"%{search}%"))
        
        total = query.count()
        projects = query.order_by(Project.updated_at.desc()).offset(skip).limit(limit).all()
        
        return projects, total
    
    @staticmethod
    def can_access(db: Session, project: Project, user: User) -> bool:
        """检查用户是否有权限访问项目"""
        # 公开的所有人可看
        if project.is_public:
            return True
        # 作者可看
        if project.author_id == user.id:
            return True
        # 管理员可看
        if user.role == "admin":
            return True
        # 检查授权记录
        access = db.query(ProjectAccess).filter(
            ProjectAccess.project_id == project.id,
            ProjectAccess.user_id == user.id
        ).first()
        return access is not None
    
    @staticmethod
    def verify_password(project: Project, password: str) -> bool:
        """验证项目密码"""
        if not project.view_password:
            return True
        return project.view_password == password
    
    @staticmethod
    def grant_access(db: Session, project_id: int, user_id: int):
        """授权用户访问项目"""
        access = ProjectAccess(project_id=project_id, user_id=user_id)
        db.add(access)
        db.commit()
    
    @staticmethod
    def revoke_access(db: Session, project: Project):
        """密码修改后撤销所有访问权限"""
        db.query(ProjectAccess).filter(ProjectAccess.project_id == project.id).delete()
        db.commit()
