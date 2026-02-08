# AxHost 项目设计文档

## 1. 项目概述

AxHost 是一个 Axure 原型文件托管系统，用于团队内部共享和查看原型文件。

## 2. 技术栈

- **后端**: FastAPI + SQLAlchemy + PostgreSQL
- **前端**: Tailwind CSS + Alpine.js (轻量级)
- **部署**: Docker Compose
- **认证**: JWT + Cookie (30天过期)

## 3. 数据库设计

### 3.1 用户表 (users)
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'product_manager', 'developer')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 原型表 (projects)
```sql
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    object_id VARCHAR(36) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    author_id INTEGER REFERENCES users(id),
    view_password VARCHAR(18),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3 访问记录表 (project_access)
```sql
CREATE TABLE project_access (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id)
);
```

## 4. 数据迁移方案

### 4.1 从旧系统迁移

原有表结构：
- projects: id, object_id, name, created_at, updated_at

迁移步骤：
1. 创建新数据库结构
2. 迁移项目数据：
   - object_id, name 保留
   - 设置默认 author（第一个管理员）
   - 所有项目初始为公开（无密码）
3. 创建默认管理员账户

### 4.2 迁移脚本
见 `scripts/migrate.py`

## 5. 权限矩阵

| 功能 | 管理员 | 产品经理 | 技术开发 |
|------|--------|----------|----------|
| 用户管理 | ✅ | ❌ | ❌ |
| 上传原型 | ✅ | ✅ | ❌ |
| 查看公开原型 | ✅ | ✅ | ✅ |
| 查看私密原型(被分享) | ✅ | ✅ | ✅ |
| 设置原型密码 | ✅ | ✅ | ❌ |

## 6. 页面设计

### 6.1 登录页
- 简洁居中设计
- 工号 + 密码输入
- 记住我选项

### 6.2 原型列表页
- 卡片式布局
- 搜索 + 分页
- 公开/私密标识
- 上传按钮(产品经理/管理员)

### 6.3 原型查看页
- 密码输入模态框(如需)
- 原型文件展示
- 返回列表

### 6.4 管理后台
- 用户管理表格
- 角色编辑
- 状态切换

## 7. API 设计

### 7.1 认证
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me

### 7.2 原型
- GET /api/projects - 列表(带权限过滤)
- POST /api/projects - 上传(产品经理+)
- GET /api/projects/{id} - 详情
- POST /api/projects/{id}/verify - 密码验证
- PUT /api/projects/{id} - 更新(密码等)
- DELETE /api/projects/{id} - 删除(作者/管理员)

### 7.3 用户管理(管理员)
- GET /api/users
- POST /api/users
- PUT /api/users/{id}
- DELETE /api/users/{id}

## 8. 现代UI特性

- 深色/浅色模式切换
- 响应式设计
- 平滑过渡动画
- 加载骨架屏
- Toast 通知
