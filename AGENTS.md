# AxHost - Axure 原型文件托管系统

## 项目概述

AxHost 是一个用于托管和分享 Axure 原型文件的 Web 应用程序。它支持用户上传、管理和浏览 Axure 原型项目，并提供了基于角色的访问控制和密码保护功能。

### 核心功能

- **用户管理**: 支持三种角色（管理员、产品经理、开发者）
- **原型管理**: 上传、更新、删除原型项目，支持 ZIP/HTML 文件
- **访问控制**: 公开/私密项目，6-18位数字字母密码保护
- **标签系统**: 为项目添加标签，支持常用标签管理
- **响应式 UI**: 卡片/列表双视图，支持拖拽上传

## 技术栈

### 后端
- **框架**: FastAPI (Python 3.11)
- **ORM**: SQLAlchemy 2.0
- **数据库**: PostgreSQL 15
- **认证**: JWT + Cookie (30天会话保持)
- **密码加密**: SHA256 + Salt

### 前端
- **CSS 框架**: Tailwind CSS (CDN)
- **JS 框架**: 原生 JavaScript + Alpine.js (部分页面)
- **字体**: Inter
- **图标**: SVG 内联图标

### 部署
- **容器化**: Docker + Docker Compose
- **Web 服务器**: Uvicorn
- **时区**: Asia/Shanghai (CST)

## 项目结构

```
axhost/
├── app/                          # 应用主目录
│   ├── core/                     # 核心配置模块
│   │   ├── config.py             # 环境变量配置 (pydantic-settings)
│   │   ├── database.py           # 数据库连接和会话管理
│   │   └── security.py           # 密码哈希和 JWT 处理
│   ├── models/                   # SQLAlchemy 数据模型
│   │   └── models.py             # User, Project, ProjectAccess, Tag 等模型
│   ├── schemas/                  # Pydantic 数据验证模型
│   │   └── schemas.py            # 请求/响应数据校验
│   ├── routers/                  # API 路由
│   │   ├── auth.py               # 认证路由 (登录/登出/当前用户)
│   │   ├── users.py              # 用户管理路由
│   │   ├── projects.py           # 原型管理路由 + 页面路由
│   │   └── tags.py               # 标签管理路由
│   ├── services/                 # 业务逻辑层
│   │   └── services.py           # UserService, ProjectService, TagService
│   ├── static/                   # 静态文件
│   │   ├── css/                  # 样式文件
│   │   ├── js/                   # JavaScript 文件
│   │   │   ├── components/       # 可复用组件
│   │   │   └── pages/            # 页面特定脚本
│   │   └── fonts/                # 字体文件
│   ├── templates/                # Jinja2 HTML 模板
│   │   ├── components/           # 模板组件
│   │   ├── base.html             # 基础模板
│   │   ├── index.html            # 主页（项目管理）
│   │   ├── login.html            # 登录页
│   │   └── admin.html            # 管理后台
│   ├── tests/                    # 测试目录
│   │   ├── conftest.py           # pytest 配置和 fixtures
│   │   └── test_all.py           # 单元测试
│   └── main.py                   # FastAPI 应用入口
├── scripts/                      # 工具脚本
│   ├── init.sql                  # 数据库初始化脚本
│   └── migrate.py                # 旧版数据迁移脚本
├── docker-compose.dev.yml        # 开发环境配置
├── docker-compose.prod.yml       # 生产环境配置
├── Dockerfile                    # 应用镜像构建
├── requirements.txt              # Python 依赖
└── uploads/                      # 上传文件存储目录
```

## 数据库模型

### 用户表 (users)
- `id`: 主键
- `name`: 姓名
- `employee_id`: 工号（唯一）
- `password_hash`: 密码哈希 (salt:hash 格式)
- `role`: 角色 (admin/product_manager/developer)
- `status`: 状态 (active/inactive)
- `created_at`: 创建时间

### 项目表 (projects)
- `id`: 主键
- `object_id`: 唯一标识符（用于 URL）
- `name`: 项目名称
- `author_id`: 作者 ID（外键）
- `view_password`: 访问密码（明文存储）
- `is_public`: 是否公开
- `remark`: 备注
- `created_at`: 创建时间
- `updated_at`: 更新时间

### 访问记录表 (project_access)
- 记录用户通过密码验证后可访问的私密项目
- 密码修改时会清除该项目的所有访问记录

### 标签表 (tags)
- `id`: 主键
- `name`: 标签名称（唯一，最多16字符）
- `emoji`: Emoji 图标
- `color`: 背景色（9种预设配色）
- `creator_id`: 创建者 ID

### 关联表
- **project_tags**: 项目-标签多对多关联
- **user_common_tags**: 用户常用标签

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DATABASE_URL` | postgresql://... | 数据库连接字符串 |
| `SECRET_KEY` | dev-secret-key... | JWT 签名密钥 |
| `ACCESS_TOKEN_EXPIRE_DAYS` | 30 | 登录会话有效期 |
| `UPLOAD_DIR` | /app/uploads | 上传文件存储路径 |
| `DEBUG` | true/false | 调试模式开关 |

## 开发和运行

### 开发环境启动

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

开发环境特性：
- 代码热重载（`--reload` 模式）
- 本地代码挂载到容器
- 单 worker，详细错误信息
- 访问 http://localhost:8000
- 默认管理员: admin / admin123

### 生产环境启动

```bash
# 设置环境变量
export SECRET_KEY="your-secure-secret-key-here"
export POSTGRES_PASSWORD="your-secure-db-password"

# 启动服务
docker compose -f docker-compose.prod.yml up --build -d
```

生产环境特性：
- 4个 worker 进程（可配置 `UVICORN_WORKERS`）
- 资源限制（CPU: 2核, 内存: 1GB）
- 自动重启策略
- 无代码挂载，使用镜像内代码

### 常用命令

```bash
# 查看日志
docker compose -f docker-compose.dev.yml logs -f web

# 重启 web 服务
docker compose -f docker-compose.dev.yml restart web

# 进入容器调试
docker compose -f docker-compose.dev.yml exec web bash

# 数据库命令行
docker compose -f docker-compose.dev.yml exec db psql -U axhost -d axhost
```

## 测试

### 运行测试

```bash
# 使用 pytest 运行所有测试
python -m pytest app/tests/ -v

# 或者在项目根目录
pytest app/tests/ -v
```

### 测试配置

- 使用 SQLite 内存数据库进行测试
- 每个测试函数独立创建/销毁数据库表
- 提供 fixtures: `db`, `client`, `sample_user`, `sample_admin`, `sample_project`

### 测试覆盖范围

- **安全模块**: 密码哈希、JWT 创建和验证
- **用户服务**: 创建、查询、更新、删除
- **项目服务**: 创建、查询、更新、权限检查
- **权限系统**: 管理员/作者/开发者不同角色的访问权限

## 代码规范

### Python 代码风格

- 遵循 PEP 8
- 使用 4 空格缩进
- 函数和变量使用 snake_case
- 类使用 PascalCase
- 常量使用 UPPER_CASE

### 导入顺序

```python
# 1. 标准库
import os
from datetime import datetime

# 2. 第三方库
from fastapi import FastAPI
from sqlalchemy import create_engine

# 3. 项目内部模块
from app.core.database import get_db
from app.models.models import User
```

### 路由命名规范

- API 路由: `prefix="/api/xxx"`
- 页面路由: 无前缀，直接注册到 `main.py`
- 权限检查使用依赖注入: `Depends(get_current_user)`

### 模板开发

- 所有模板继承 `base.html`
- 页面特定样式放在 `{% block extra_css %}`
- 页面特定脚本放在 `{% block extra_js %}`
- 静态文件 URL 添加版本号: `?v=YYYYMMDDNNN`

## 安全注意事项

1. **密码存储**: 使用 SHA256 + Salt，格式为 `salt:hash`
2. **JWT 安全**: 生产环境必须修改默认 `SECRET_KEY`
3. **密码强度**: 用户密码需 6-18 位，项目密码相同规则
4. **SQL 注入**: 使用 SQLAlchemy ORM，禁止直接拼接 SQL
5. **路径安全**: 原型文件访问时校验路径，防止目录遍历
6. **Cookie 安全**: 使用 `httponly` 和 `samesite="lax"`

## 数据迁移

从旧版 Flask/MySQL 迁移到新版 FastAPI/PostgreSQL:

```bash
# 配置环境变量
export OLD_DATABASE_URL="mysql+pymysql://user:pass@host:port/db"
export DATABASE_URL="postgresql://user:pass@host:port/db"

# 运行迁移脚本
python scripts/migrate.py
```

注意：迁移脚本只迁移项目基本信息，需要手动调整权限和密码。

## API 设计规范

### 响应格式

成功响应:
```json
{
    "items": [...],
    "total": 100,
    "page": 1,
    "per_page": 20
}
```

或:
```json
{
    "message": "操作成功"
}
```

错误响应:
```json
{
    "detail": "错误描述"
}
```

### HTTP 状态码

- `200`: 成功
- `201`: 创建成功
- `400`: 请求参数错误
- `401`: 未登录或登录过期
- `403`: 权限不足
- `404`: 资源不存在

## 文件上传说明

- 支持 ZIP 和 HTML 格式
- ZIP 文件自动解压，查找包含 `index.html` 和 `start.html` 的目录
- 中文文件名使用 GBK/CP437 编码处理
- 过滤 `__MACOSX` 和 `.DS_Store` 文件
- 上传目录通过环境变量 `UPLOAD_DIR` 配置

## 时间处理

- 数据库存储 UTC 时间
- 前端展示转换为东八区（CST）
- 使用 `format_to_cst()` 函数进行转换

## 开发提示

1. **添加新依赖**: 修改 `requirements.txt` 后需要重新构建镜像
2. **数据库变更**: 修改模型后需要重启容器，SQLAlchemy 会自动创建表
3. **模板修改**: 修改模板文件无需重启，刷新页面即可
4. **静态文件**: 修改 JS/CSS 后建议清除浏览器缓存
5. **调试技巧**: 使用 `print()` 输出会在 Docker 日志中显示

## 默认账号

- **用户名**: admin
- **密码**: admin123
- **角色**: 管理员

首次登录后建议立即修改密码。
