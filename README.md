# AxHost

Axure 原型文件托管系统 - 现代化重构版

## 技术栈

- **后端**: FastAPI + SQLAlchemy + PostgreSQL
- **前端**: Tailwind CSS + Alpine.js
- **部署**: Docker Compose
- **认证**: JWT + Cookie (30天会话保持)

## 快速开始

### 开发环境（推荐日常开发使用）

```bash
cd ~/codes/axhost
docker compose -f docker-compose.dev.yml up --build -d
```

开发环境特性：
- ✅ **代码热重载**：修改 Python 代码后自动重启
- ✅ **本地挂载**：直接编辑本地代码，容器内实时同步
- ✅ **调试友好**：单 worker 模式，错误信息详细

### 生产环境

```bash
cd ~/codes/axhost

# 1. 配置环境变量（必须修改默认值！）
export SECRET_KEY="your-secure-secret-key-here"
export POSTGRES_PASSWORD="your-secure-db-password"

# 2. 启动服务
docker compose -f docker-compose.prod.yml up --build -d
```

生产环境特性：
- 🔒 **安全可靠**：不暴露源码，使用环境变量配置
- ⚡ **高性能**：多 worker 模式，支持并发请求
- 🔄 **自动重启**：服务异常自动恢复
- 💾 **资源限制**：防止资源耗尽

### 访问系统

- 前台: http://localhost:8000
- 默认管理员: admin / admin123

### 停止服务

```bash
# 开发环境
docker compose -f docker-compose.dev.yml down

# 生产环境
docker compose -f docker-compose.prod.yml down
```

### 数据迁移（从旧系统）

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
├── docker-compose.dev.yml   # 开发环境配置
├── docker-compose.prod.yml  # 生产环境配置
├── Dockerfile
└── README.md
```

## 数据迁移方案

见 `DESIGN.md` 中的详细说明。

## 开发说明

### 常用命令

```bash
# 开发模式启动
docker compose -f docker-compose.dev.yml up --build -d

# 查看日志
docker compose -f docker-compose.dev.yml logs -f web

# 重启 web 服务
docker compose -f docker-compose.dev.yml restart web

# 进入容器调试
docker compose -f docker-compose.dev.yml exec web bash

# 数据库命令行
docker compose -f docker-compose.dev.yml exec db psql -U axhost -d axhost
```

### 热重载说明

开发环境已配置热重载，修改 `app/` 目录下的代码后会自动重启服务。但如果修改了以下文件，需要重新构建：

- `requirements.txt`（新增依赖）
- `Dockerfile`
- `docker-compose.*.yml`

重新构建命令：
```bash
docker compose -f docker-compose.dev.yml up --build -d
```
