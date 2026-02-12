import secrets
import string
from typing import Optional, List
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.models import User, Project, ProjectAccess, Tag, ProjectTag, UserCommonTag
from app.schemas.schemas import UserCreate, UserUpdate, ProjectCreate, ProjectUpdate, TagCreate, TagUpdate
from app.core.security import get_password_hash

TAG_ALLOWED_COLORS = {
    "#ffffff",
    "#d5e4fe",
    "#d6f1ff",
    "#d3f3e2",
    "#fedbdb",
    "#ffecdb",
    "#fff5cc",
    "#fbdbff",
    "#ffdbea",
}
TAG_DEFAULT_COLOR = "#ffffff"

def generate_object_id() -> str:
    """生成唯一的 object_id"""
    import uuid
    from datetime import datetime
    return f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}"

def generate_password(length: int = 6) -> str:
    """生成随机密码（数字+字母）"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def normalize_tag_name(name: str) -> str:
    return (name or "").strip()


def validate_tag_color(color: Optional[str]) -> str:
    if not color:
        return TAG_DEFAULT_COLOR
    if color not in TAG_ALLOWED_COLORS:
        raise ValueError("标签配色不在允许范围内")
    return color


def sanitize_tag_names(tag_names: Optional[List[str]]) -> List[str]:
    if not tag_names:
        return []
    unique_names: List[str] = []
    seen = set()
    for raw_name in tag_names:
        name = normalize_tag_name(raw_name)
        if not name:
            continue
        if len(name) > 16:
            raise ValueError(f"标签名称超过16个字符: {name}")
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        unique_names.append(name)
    return unique_names

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
            is_public=project_data.is_public,
            remark=project_data.remark
        )
        db.add(db_project)
        db.flush()
        if project_data.tag_names:
            TagService.replace_project_tags(db, db_project, project_data.tag_names, author_id)
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
        if project_data.remark is not None:
            project.remark = project_data.remark
        if project_data.tag_names is not None:
            TagService.replace_project_tags(db, project, project_data.tag_names, project.author_id)
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
    
    @staticmethod
    def change_author(db: Session, project: Project, new_author_id: int):
        """更改项目作者"""
        project.author_id = new_author_id
        db.commit()
        db.refresh(project)
        return project
    
    @staticmethod
    def touch(db: Session, project: Project):
        """更新项目更新时间"""
        from datetime import datetime
        project.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(project)
        return project

    @staticmethod
    def get_tags(project: Project) -> List[Tag]:
        return [item.tag for item in project.project_tags if item.tag]


class TagService:
    @staticmethod
    def list_all(db: Session, search: str = ""):
        query = db.query(Tag)
        if search:
            query = query.filter(Tag.name.ilike(f"%{search}%"))
        return query.order_by(Tag.created_at.desc()).all()

    @staticmethod
    def get_by_name(db: Session, name: str) -> Optional[Tag]:
        return db.query(Tag).filter(Tag.name == name).first()

    @staticmethod
    def get_by_id(db: Session, tag_id: int) -> Optional[Tag]:
        return db.query(Tag).filter(Tag.id == tag_id).first()

    @staticmethod
    def create(db: Session, data: TagCreate, creator_id: int) -> Tag:
        name = normalize_tag_name(data.name)
        if not name:
            raise ValueError("标签名称不能为空")
        if len(name) > 16:
            raise ValueError("标签名称不可超过16个字符")
        color = validate_tag_color(data.color)
        tag = Tag(
            name=name,
            emoji=(data.emoji or "").strip() or None,
            color=color,
            creator_id=creator_id
        )
        db.add(tag)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise ValueError("标签名称已存在")
        db.refresh(tag)
        return tag

    @staticmethod
    def update(db: Session, tag: Tag, data: TagUpdate) -> Tag:
        if data.name is not None:
            name = normalize_tag_name(data.name)
            if not name:
                raise ValueError("标签名称不能为空")
            if len(name) > 16:
                raise ValueError("标签名称不可超过16个字符")
            tag.name = name
        if data.emoji is not None:
            tag.emoji = (data.emoji or "").strip() or None
        if data.color is not None:
            tag.color = validate_tag_color(data.color)

        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise ValueError("标签名称已存在")
        db.refresh(tag)
        return tag

    @staticmethod
    def get_or_create_by_name(db: Session, name: str, creator_id: int) -> Tag:
        normalized = normalize_tag_name(name)
        if not normalized:
            raise ValueError("标签名称不能为空")
        if len(normalized) > 16:
            raise ValueError("标签名称不可超过16个字符")
        existing = TagService.get_by_name(db, normalized)
        if existing:
            return existing
        tag = Tag(name=normalized, color=TAG_DEFAULT_COLOR, creator_id=creator_id)
        db.add(tag)
        db.flush()
        return tag

    @staticmethod
    def replace_project_tags(db: Session, project: Project, tag_names: List[str], creator_id: int):
        names = sanitize_tag_names(tag_names)
        db.query(ProjectTag).filter(ProjectTag.project_id == project.id).delete()
        for name in names:
            tag = TagService.get_or_create_by_name(db, name, creator_id)
            db.add(ProjectTag(project_id=project.id, tag_id=tag.id))

    @staticmethod
    def list_common_tags(db: Session, user_id: int) -> List[Tag]:
        rows = db.query(UserCommonTag).filter(UserCommonTag.user_id == user_id).order_by(UserCommonTag.created_at.asc()).all()
        return [row.tag for row in rows if row.tag]

    @staticmethod
    def add_common_tag(db: Session, user_id: int, tag_id: int):
        exists = db.query(UserCommonTag).filter(UserCommonTag.user_id == user_id, UserCommonTag.tag_id == tag_id).first()
        if exists:
            return
        db.add(UserCommonTag(user_id=user_id, tag_id=tag_id))
        db.commit()

    @staticmethod
    def remove_common_tag(db: Session, user_id: int, tag_id: int):
        db.query(UserCommonTag).filter(UserCommonTag.user_id == user_id, UserCommonTag.tag_id == tag_id).delete()
        db.commit()
