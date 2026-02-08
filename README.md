# AxHost

Axure 原型文件托管系统 - 现代化重构版

## 技术栈

- **后端**: FastAPI + SQLAlchemy + PostgreSQL
- **前端**: Tailwind CSS + Alpine.js
- **部署**: Docker Compose
- **认证**: JWT + Cookie (30天会话保持)

## 快速开始

### 1. 启动服务

```bash
cd ~/codes/axhost
docker-compose up -d
```

### 2. 访问系统

- 前台: http://localhost:8000
- 默认管理员: admin / admin123

### 3. 数据迁移（从旧系统）

```bash
# 修改脚本中的数据库连接信息
python scripts/migrate.py
```

## 功能特性

### 用户角色
- **管理员**: 用户管理、所有原型管理
- **产品经理**: 上传原型、设置密码、查看公开/授权原型
- **技术开发**: 查看公开/授权原型

### 原型管理
- 公开/私密设置
- 6-18位数字字母密码（支持自动生成）
- 密码验证后自动授权
- 密码修改后自动撤销授权

### 现代 UI
- 响应式设计
- 渐变配色
- 卡片式布局
- 平滑动画

## 目录结构

```
axhost/
├── app/
│   ├── core/           # 核心配置
│   ├── models/         # 数据库模型
│   ├── routers/        # API 路由
│   ├── schemas/        # 数据校验
│   ├── services/       # 业务逻辑
│   ├── static/         # 静态文件
│   ├── templates/      # HTML 模板
│   └── main.py         # 应用入口
├── scripts/
│   ├── init.sql        # 数据库初始化
│   └── migrate.py      # 数据迁移
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## 数据迁移方案

见 `DESIGN.md` 中的详细说明。

## 开发说明

代码热更新已配置，修改后自动重启。
