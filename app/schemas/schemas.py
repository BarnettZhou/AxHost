from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, List

# 用户相关
class UserBase(BaseModel):
    name: str
    employee_id: str
    role: str  # admin, product_manager, developer
    status: str = "active"

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    password: Optional[str] = None

class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    created_at: datetime

# 登录相关
class LoginRequest(BaseModel):
    employee_id: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# 标签相关
class TagBase(BaseModel):
    name: str
    emoji: Optional[str] = None
    color: str = "#D3D3D3"


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    color: Optional[str] = None


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    emoji: Optional[str] = None
    color: str
    creator_id: Optional[int] = None
    created_at: datetime
    can_edit: bool = False


# 项目相关
class ProjectBase(BaseModel):
    name: str

class ProjectCreate(ProjectBase):
    view_password: Optional[str] = None
    is_public: bool = False
    remark: Optional[str] = None
    tag_names: List[str] = Field(default_factory=list)

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    view_password: Optional[str] = None
    is_public: Optional[bool] = None
    remark: Optional[str] = None
    tag_names: Optional[List[str]] = None

class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    object_id: str
    name: str
    author_id: int
    author_name: str
    view_password: Optional[str]
    is_public: bool
    remark: Optional[str] = None
    tags: List[TagResponse] = []
    created_at: datetime
    updated_at: datetime
    can_access: bool = False

class ProjectVerifyRequest(BaseModel):
    password: str

# 项目列表响应
class ProjectListResponse(BaseModel):
    items: List[ProjectResponse]
    total: int
    page: int
    per_page: int

# 更改作者请求
class ChangeAuthorRequest(BaseModel):
    new_author_id: int
