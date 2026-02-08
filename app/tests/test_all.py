"""
AxHost 单元测试

运行测试: python -m pytest app/tests/ -v
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base, get_db
from app.models.models import User, Project, ProjectAccess
from app.services.services import UserService, ProjectService, generate_password, generate_object_id
from app.core.security import get_password_hash, verify_password, create_access_token, decode_token

# 使用内存数据库进行测试
TEST_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db():
    """创建测试数据库会话"""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture
def sample_user(db):
    """创建测试用户"""
    user = User(
        name="测试用户",
        employee_id="test001",
        password_hash=get_password_hash("password123"),
        role="product_manager",
        status="active"
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@pytest.fixture
def sample_admin(db):
    """创建测试管理员"""
    user = User(
        name="管理员",
        employee_id="admin001",
        password_hash=get_password_hash("admin123"),
        role="admin",
        status="active"
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@pytest.fixture
def sample_project(db, sample_user):
    """创建测试项目"""
    project = Project(
        object_id=generate_object_id(),
        name="测试原型",
        author_id=sample_user.id,
        view_password=None,
        is_public=True
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


class TestSecurity:
    """安全模块测试"""
    
    def test_password_hash(self):
        """测试密码哈希"""
        password = "testpassword"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True
        assert verify_password("wrongpassword", hashed) is False
    
    def test_token_create_and_decode(self):
        """测试 Token 创建和解码"""
        user_id = "123"
        token = create_access_token({"sub": user_id})
        assert token is not None
        
        decoded = decode_token(token)
        assert decoded is not None
        assert decoded["sub"] == user_id
    
    def test_invalid_token(self):
        """测试无效 Token"""
        decoded = decode_token("invalid.token.here")
        assert decoded is None


class TestUserService:
    """用户服务测试"""
    
    def test_create_user(self, db):
        """测试创建用户"""
        from app.schemas.schemas import UserCreate
        
        user_data = UserCreate(
            name="张三",
            employee_id="zhangsan001",
            password="password123",
            role="developer",
            status="active"
        )
        
        user = UserService.create(db, user_data)
        assert user.id is not None
        assert user.name == "张三"
        assert user.employee_id == "zhangsan001"
        assert user.role == "developer"
    
    def test_get_by_employee_id(self, db, sample_user):
        """测试通过工号获取用户"""
        user = UserService.get_by_employee_id(db, "test001")
        assert user is not None
        assert user.name == "测试用户"
        
        # 测试不存在的用户
        user = UserService.get_by_employee_id(db, "notexist")
        assert user is None
    
    def test_update_user(self, db, sample_user):
        """测试更新用户"""
        from app.schemas.schemas import UserUpdate
        
        update_data = UserUpdate(name="新名字", status="inactive")
        updated = UserService.update(db, sample_user, update_data)
        
        assert updated.name == "新名字"
        assert updated.status == "inactive"
    
    def test_delete_user(self, db, sample_user):
        """测试删除用户"""
        user_id = sample_user.id
        UserService.delete(db, sample_user)
        
        deleted = UserService.get_by_id(db, user_id)
        assert deleted is None


class TestProjectService:
    """项目服务测试"""
    
    def test_create_project(self, db, sample_user):
        """测试创建项目"""
        from app.schemas.schemas import ProjectCreate
        
        project_data = ProjectCreate(
            name="新原型项目",
            view_password="123456",
            is_public=False
        )
        
        project = ProjectService.create(db, project_data, sample_user.id)
        assert project.id is not None
        assert project.object_id is not None
        assert project.name == "新原型项目"
        assert project.view_password == "123456"
        assert project.is_public is False
    
    def test_get_by_object_id(self, db, sample_project):
        """测试通过 object_id 获取项目"""
        project = ProjectService.get_by_object_id(db, sample_project.object_id)
        assert project is not None
        assert project.name == "测试原型"
    
    def test_update_project(self, db, sample_project):
        """测试更新项目"""
        from app.schemas.schemas import ProjectUpdate
        
        update_data = ProjectUpdate(name="更新后的名称", is_public=False)
        updated = ProjectService.update(db, sample_project, update_data)
        
        assert updated.name == "更新后的名称"
        assert updated.is_public is False
    
    def test_verify_password(self, db):
        """测试密码验证"""
        from app.schemas.schemas import ProjectCreate
        
        # 公开项目
        public_project = Project(
            object_id=generate_object_id(),
            name="公开项目",
            view_password=None,
            is_public=True
        )
        assert ProjectService.verify_password(public_project, "") is True
        assert ProjectService.verify_password(public_project, "anypassword") is True
        
        # 私密项目
        private_project = Project(
            object_id=generate_object_id(),
            name="私密项目",
            view_password="secret123",
            is_public=False
        )
        assert ProjectService.verify_password(private_project, "secret123") is True
        assert ProjectService.verify_password(private_project, "wrongpass") is False
    
    def test_grant_and_revoke_access(self, db, sample_project, sample_user):
        """测试授权和撤销访问"""
        # 授权
        ProjectService.grant_access(db, sample_project.id, sample_user.id)
        
        access = db.query(ProjectAccess).filter(
            ProjectAccess.project_id == sample_project.id,
            ProjectAccess.user_id == sample_user.id
        ).first()
        assert access is not None
        
        # 撤销
        ProjectService.revoke_access(db, sample_project)
        
        access = db.query(ProjectAccess).filter(
            ProjectAccess.project_id == sample_project.id
        ).first()
        assert access is None


class TestPermissions:
    """权限测试"""
    
    def test_admin_can_access_all(self, db, sample_admin, sample_project):
        """测试管理员可以访问所有项目"""
        can_access = ProjectService.can_access(db, sample_project, sample_admin)
        assert can_access is True
    
    def test_author_can_access_own_project(self, db, sample_user, sample_project):
        """测试作者可以访问自己的项目"""
        can_access = ProjectService.can_access(db, sample_project, sample_user)
        assert can_access is True
    
    def test_developer_can_access_public_project(self, db, sample_project):
        """测试开发者可以访问公开项目"""
        developer = User(
            name="开发者",
            employee_id="dev001",
            password_hash=get_password_hash("pass"),
            role="developer",
            status="active"
        )
        db.add(developer)
        db.commit()
        
        # 公开项目可以访问
        sample_project.is_public = True
        db.commit()
        
        can_access = ProjectService.can_access(db, sample_project, developer)
        assert can_access is True
    
    def test_developer_cannot_access_private_project(self, db):
        """测试开发者不能访问未授权的私密项目"""
        developer = User(
            name="开发者",
            employee_id="dev002",
            password_hash=get_password_hash("pass"),
            role="developer",
            status="active"
        )
        db.add(developer)
        
        private_project = Project(
            object_id=generate_object_id(),
            name="私密项目",
            view_password="pass123",
            is_public=False
        )
        db.add(private_project)
        db.commit()
        db.refresh(developer)
        db.refresh(private_project)
        
        can_access = ProjectService.can_access(db, private_project, developer)
        assert can_access is False
    
    def test_authorized_user_can_access(self, db, sample_user):
        """测试授权用户可以访问私密项目"""
        # 另一个用户创建私密项目
        owner = User(
            name="项目所有者",
            employee_id="owner001",
            password_hash=get_password_hash("pass"),
            role="product_manager",
            status="active"
        )
        db.add(owner)
        db.commit()
        db.refresh(owner)
        
        private_project = Project(
            object_id=generate_object_id(),
            name="私密项目",
            author_id=owner.id,
            view_password="pass123",
            is_public=False
        )
        db.add(private_project)
        db.commit()
        db.refresh(private_project)
        
        # 未授权时不能访问
        can_access = ProjectService.can_access(db, private_project, sample_user)
        assert can_access is False
        
        # 授权后可以访问
        ProjectService.grant_access(db, private_project.id, sample_user.id)
        can_access = ProjectService.can_access(db, private_project, sample_user)
        assert can_access is True


class TestUtils:
    """工具函数测试"""
    
    def test_generate_password(self):
        """测试密码生成"""
        password1 = generate_password(6)
        password2 = generate_password(6)
        
        assert len(password1) == 6
        assert len(password2) == 6
        assert password1 != password2  # 随机性
        assert password1.isalnum()  # 只包含字母和数字
    
    def test_generate_object_id(self):
        """测试 object_id 生成"""
        id1 = generate_object_id()
        id2 = generate_object_id()
        
        assert id1 != id2  # 唯一性
        assert len(id1.split('_')) == 2  # 格式: 时间戳_uuid


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
