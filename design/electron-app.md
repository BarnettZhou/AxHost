# Axhost Electron 客户端设计方案

## 1. 概述

### 1.1 项目目标
为 Axure 设计师提供本地-云端无缝同步的桌面客户端，实现：
- 自动监听本地 Axure 输出目录变更
- 一键打包上传至 Axhost 平台
- 本地项目与线上项目的智能绑定

### 1.2 核心价值
- **效率提升**：省去手动打包、登录网页、上传的步骤
- **实时同步**：本地修改自动检测，支持自动/手动上传
- **离线管理**：本地即可查看所有项目同步状态

---

## 2. 技术架构

### 2.1 技术栈选型

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 框架 | Electron 28+ + TypeScript | 跨平台桌面应用 |
| 前端 UI | React 18 + Tailwind CSS | 与 Web 端保持一致的 UI 风格 |
| 状态管理 | Zustand | 轻量级状态管理 |
| 本地存储 | better-sqlite3 | 项目绑定关系、配置存储 |
| 文件监听 | chokidar | 高性能文件系统监听 |
| 压缩打包 | adm-zip | 生成 zip 文件 |
| HTTP 通信 | axios | 与 Axhost API 通信 |
| 构建工具 | electron-builder | 应用打包分发 |

### 2.2 项目结构

```
electron-app/
├── electron/
│   ├── main/                    # 主进程
│   │   ├── index.ts             # 入口
│   │   ├── ipc-handlers/        # IPC 处理器
│   │   │   ├── file.ts          # 文件操作
│   │   │   ├── api.ts           # HTTP API 调用
│   │   │   ├── project.ts       # 项目管理
│   │   │   └── auth.ts          # 认证相关
│   │   ├── services/
│   │   │   ├── WatcherService.ts      # 文件监听服务
│   │   │   ├── DatabaseService.ts     # SQLite 服务
│   │   │   ├── UploadService.ts       # 上传服务
│   │   │   └── AuthService.ts         # 认证服务
│   │   └── utils/
│   ├── preload/                 # 预加载脚本
│   │   └── index.ts             # 安全暴露 API
│   └── renderer/                # 渲染进程 (React)
│       ├── src/
│       │   ├── components/      # UI 组件
│       │   ├── pages/           # 页面
│       │   ├── stores/          # Zustand 状态
│       │   ├── hooks/           # React Hooks
│       │   └── utils/           # 工具函数
│       └── index.html
├── resources/                   # 静态资源
└── package.json
```

---

## 3. 核心模块设计

### 3.1 数据库设计 (SQLite)

```sql
-- 本地项目表（与线上项目绑定）
CREATE TABLE local_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_path TEXT UNIQUE NOT NULL,        -- 本地绝对路径
    remote_project_id TEXT,                 -- 线上项目 object_id
    project_name TEXT NOT NULL,             -- 项目名称（本地目录名或自定义）
    last_sync_at TIMESTAMP,                 -- 最后同步时间
    last_modified_at TIMESTAMP,             -- 本地最后修改时间
    sync_status TEXT DEFAULT 'pending',     -- pending/syncing/synced/error
    auto_sync BOOLEAN DEFAULT 0,            -- 是否自动同步
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 同步历史记录
CREATE TABLE sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_project_id INTEGER,
    remote_project_id TEXT,
    sync_type TEXT,                         -- create/update
    status TEXT,                            -- success/failed
    message TEXT,                           -- 失败原因
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (local_project_id) REFERENCES local_projects(id)
);

-- 应用配置
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认配置
INSERT INTO app_settings (key, value) VALUES
('watch_enabled', 'true'),
('server_url', 'http://localhost:8000'),
('auto_sync_interval', '300'),              -- 自动同步间隔（秒）
('theme', 'light');
```

### 3.2 文件监听服务 (WatcherService)

```typescript
// 核心职责：监听配置目录的子目录变更
class WatcherService {
  private watcher: FSWatcher | null = null;
  private basePath: string = '';
  
  // 启动监听
  async startWatching(basePath: string): Promise<void>;
  
  // 停止监听
  async stopWatching(): Promise<void>;
  
  // 手动扫描（启动时执行，补充可能错过的变更）
  async scanProjects(): Promise<LocalProject[]>;
  
  // 事件处理
  private onDirAdd(dirPath: string): void;      // 新增项目目录
  private onDirChange(dirPath: string): void;   // 目录内容变更
  private onDirUnlink(dirPath: string): void;   // 目录删除
  
  // 判断是否为有效的 Axure 输出目录
  private isValidAxureProject(dirPath: string): boolean {
    // 检查是否包含 start.html 或 index.html
  }
}

// 变更事件类型
interface ProjectChangeEvent {
  type: 'added' | 'modified' | 'deleted';
  path: string;
  projectName: string;
  timestamp: number;
}
```

**监听策略：**
1. 只监听一级子目录（假设 basePath 下每个子目录是一个项目）
2. 使用 `depth: 1` 避免深层遍历性能问题
3. 防抖处理：变更后延迟 2 秒再触发，避免频繁保存导致的多次触发

### 3.3 API 服务封装

```typescript
// 与 Axhost 后端通信
class ApiClient {
  private baseURL: string;
  private token: string | null;
  
  // 认证
  async login(username: string, password: string): Promise<AuthResult>;
  async refreshToken(): Promise<boolean>;
  
  // 项目操作
  async listProjects(params: ListParams): Promise<PaginatedProjects>;
  async createProject(data: CreateProjectData): Promise<Project>;
  async updateProject(objectId: string, data: UpdateProjectData): Promise<Project>;
  
  // 上传（复用现有接口）
  async uploadProject(
    file: Buffer,
    name: string,
    data: UploadMetadata
  ): Promise<Project>;
  
  async updateProjectFiles(
    objectId: string,
    file: Buffer
  ): Promise<Project>;
}

// 上传元数据
interface UploadMetadata {
  view_password?: string;
  is_public: boolean;
  remark?: string;
}
```

### 3.4 上传服务 (UploadService)

```typescript
class UploadService {
  private api: ApiClient;
  
  // 打包本地目录
  async packProject(localPath: string): Promise<Buffer> {
    // 1. 创建临时目录
    // 2. 复制项目文件到临时目录
    // 3. 生成 zip 文件
    // 4. 返回 Buffer
  }
  
  // 创建新项目并上传
  async createAndUpload(
    localProject: LocalProject,
    options: UploadOptions
  ): Promise<UploadResult>;
  
  // 更新现有项目
  async updateAndUpload(
    localProject: LocalProject
  ): Promise<UploadResult>;
  
  // 上传队列管理（防止并发上传冲突）
  private uploadQueue: Queue<UploadTask>;
}
```

---

## 4. 用户界面设计

### 4.1 主窗口布局

```
┌─────────────────────────────────────────────────────┐
│  Axhost Sync                              [_][X]   │
├──────────┬──────────────────────────────────────────┤
│          │  ┌────────────────────────────────────┐  │
│  LOGO    │  │  📁 /Users/Axure/Output            │  │
│          │  │  [更换目录] [重新扫描] [⚙️ 设置]    │  │
├──────────┤  └────────────────────────────────────┘  │
│          │                                          │
│  [👤]    │  本地项目列表（按修改时间倒序）          │
│  用户名   │                                          │
│          │  ┌────────────────────────────────────┐  │
│  ────────│  │ 🔴 项目A                   [同步]  │  │
│          │  │    路径: /Output/项目A               │  │
│  [项目]   │  │    修改: 2分钟前   同步: 昨天       │  │
│  [历史]   │  │    状态: 未绑定（线上无关联）        │  │
│  [设置]   │  └────────────────────────────────────┘  │
│          │                                          │
│          │  ┌────────────────────────────────────┐  │
│          │  │ 🟡 项目B                   [同步]  │  │
│          │  │    路径: /Output/项目B               │  │
│          │  │    修改: 5分钟前   同步: 3分钟前    │  │
│          │  │    状态: 已绑定 → 线上版本待更新    │  │
│          │  └────────────────────────────────────┘  │
│          │                                          │
│          │  ┌────────────────────────────────────┐  │
│          │  │ 🟢 项目C                   [打开]  │  │
│          │  │    路径: /Output/项目C               │  │
│          │  │    修改: 1小时前   同步: 同步完成   │  │
│          │  │    状态: 已绑定 → 已是最新          │  │
│          │  └────────────────────────────────────┘  │
└──────────┴──────────────────────────────────────────┘
```

**状态颜色说明：**
- 🔴 红色：未绑定（本地新增，未上传）
- 🟡 黄色：已绑定但有变更（待同步）
- 🟢 绿色：已同步
- ⚪ 灰色：已删除（本地目录不存在）

### 4.2 关键交互流程

#### 首次绑定目录流程
```
1. 用户选择 Axure 输出根目录
   ↓
2. 扫描子目录，识别有效项目
   ↓
3. 对比线上项目列表（按名称相似度匹配建议）
   ↓
4. 展示匹配对话框：
   本地"订单管理系统" → 建议绑定 → 线上"订单管理系统_v2"
   [确认绑定] [作为新项目上传] [跳过]
   ↓
5. 保存绑定关系到本地数据库
```

#### 同步流程
```
1. 用户点击[同步]或自动触发
   ↓
2. 打包本地目录 → 生成 zip
   ↓
3. 调用 API 上传
   ↓
4. 更新本地数据库同步状态
   ↓
5. 通知用户结果（系统通知）
```

---

## 5. 关键功能实现细节

### 5.1 目录监听与去重

```typescript
// 防抖处理，避免 Axure 保存时的多次触发
class WatcherService {
  private debounceMap = new Map<string, NodeJS.Timeout>();
  
  private onDirChange(dirPath: string) {
    // 清除之前的定时器
    if (this.debounceMap.has(dirPath)) {
      clearTimeout(this.debounceMap.get(dirPath)!);
    }
    
    // 设置新的定时器（2秒后触发）
    const timer = setTimeout(() => {
      this.handleProjectChange(dirPath);
      this.debounceMap.delete(dirPath);
    }, 2000);
    
    this.debounceMap.set(dirPath, timer);
  }
}
```

### 5.2 Axure 项目检测

```typescript
// 判断目录是否为有效的 Axure 输出目录
function isAxureProject(dirPath: string): boolean {
  const requiredFiles = ['start.html', 'index.html'];
  const files = fs.readdirSync(dirPath);
  
  // 必须包含入口 HTML 文件
  const hasEntry = requiredFiles.some(f => files.includes(f));
  
  // 应该包含 resources 目录（Axure 标准结构）
  const hasResources = files.includes('resources');
  
  return hasEntry && hasResources;
}

// 获取项目信息（尝试从 HTML 中解析）
function getProjectInfo(dirPath: string): ProjectInfo {
  // 读取 start.html，提取 title 作为项目名称
  // 提取版本信息等
}
```

### 5.3 增量上传优化

虽然当前 Axhost 只支持全量 zip 上传，但 Electron 客户端可以：

1. **文件指纹缓存**：记录每个文件的 MD5，变更时只重新打包变更文件
2. **压缩优化**：使用更快的压缩级别（STORE 或 DEFLATE 1）
3. **后台上传**：同步操作放入后台，不阻塞 UI

```typescript
// 文件指纹记录
interface FileFingerprint {
  path: string;
  md5: string;
  mtime: number;
  size: number;
}

// 对比指纹，找出变更文件
async function getChangedFiles(
  dirPath: string,
  lastFingerprints: FileFingerprint[]
): Promise<string[]> {
  // 计算当前所有文件指纹
  // 对比找出新增/修改的文件
}
```

### 5.4 自动同步策略

```typescript
// 自动同步配置
interface AutoSyncConfig {
  enabled: boolean;
  interval: number;           // 检查间隔（秒）
  syncMode: 'immediate' | 'scheduled';  // 立即同步或定时同步
  scheduledTime?: string;     // 定时同步时间（如 "18:00"）
  excludePatterns: string[];  // 排除模式（如 ["*.tmp", ".git"]）
}

// 同步决策逻辑
shouldAutoSync(project: LocalProject): boolean {
  if (!project.auto_sync) return false;
  if (!project.remote_project_id) return false; // 未绑定不上传
  
  const lastSync = project.last_sync_at?.getTime() || 0;
  const lastModified = project.last_modified_at?.getTime() || 0;
  
  // 本地有更新且距离上次同步超过5分钟
  return lastModified > lastSync && 
         (Date.now() - lastSync) > 5 * 60 * 1000;
}
```

---

## 6. 与 Axhost 后端的集成点

### 6.1 复用现有 API

| 功能 | 现有 API | 说明 |
|------|---------|------|
| 登录 | `POST /api/auth/login` | 获取 JWT Token |
| 项目列表 | `GET /api/projects` | 获取线上项目用于绑定建议 |
| 新建项目 | `POST /api/projects/upload` | 表单提交，包含 zip 文件 |
| 更新项目 | `PUT /api/projects/{id}` | 仅更新元数据 |
| 更新文件 | `POST /api/projects/{id}/update` | 更新原型文件（需确认接口） |

### 6.2 可能需要新增的后端接口

```typescript
// 1. 批量获取项目接口（用于本地绑定匹配）
GET /api/projects/all?limit=1000

// 2. 检查项目是否存在（绑定前验证）
GET /api/projects/{object_id}/exists

// 3. 仅上传文件不修改元数据（如果当前接口不支持）
POST /api/projects/{object_id}/files
Content-Type: multipart/form-data
```

---

## 7. 安全考虑

### 7.1 Token 存储
- Access Token：内存存储，进程重启需重新登录
- Refresh Token：Keychain（macOS）/ Credential Vault（Windows）安全存储

### 7.2 文件安全
- 临时 zip 文件使用随机文件名
- 上传完成后立即删除临时文件
- 对敏感配置（密码）加密存储

### 7.3 网络安全
- 强制 HTTPS（生产环境）
- 证书校验
- 请求超时设置

---

## 8. 分发与更新

### 8.1 自动更新 (electron-updater)
```typescript
// 使用 GitHub Releases 或自建更新服务器
import { autoUpdater } from 'electron-updater';

// 检查更新时机
// - 应用启动时
// - 用户手动检查
// - 定时检查（每天一次）
```

### 8.2 安装包构建
```json
// electron-builder 配置
{
  "build": {
    "appId": "com.axhost.desktop",
    "productName": "Axhost Sync",
    "directories": {
      "output": "dist"
    },
    "files": [
      "electron/**/*",
      "renderer/dist/**/*"
    ],
    "mac": {
      "target": ["dmg", "zip"],
      "category": "public.app-category.productivity"
    },
    "win": {
      "target": ["nsis", "portable"]
    }
  }
}
```

---

## 9. 开发路线图

### Phase 1: MVP (2-3 周)
- [ ] 基础框架搭建
- [ ] 登录鉴权
- [ ] 目录监听
- [ ] 手动上传（新建+更新）
- [ ] 基础项目列表

### Phase 2: 绑定管理 (1-2 周)
- [ ] 本地-线上项目绑定
- [ ] 智能匹配建议
- [ ] 同步状态显示
- [ ] 同步历史记录

### Phase 3: 自动化 (1 周)
- [ ] 自动同步开关
- [ ] 系统通知
- [ ] 冲突处理（本地 vs 线上）

### Phase 4: 优化 (1 周)
- [ ] 增量上传
- [ ] 批量操作
- [ ] 自动更新
- [ ] 性能优化

---

## 10. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| Axure 文件结构变更 | 高 | 提供自定义入口文件配置 |
| 大项目 zip 过大 | 中 | 分片上传、压缩优化 |
| 频繁保存导致频繁上传 | 中 | 防抖+智能合并 |
| Token 过期 | 低 | 自动刷新+重新登录提示 |

---

## 11. 附录

### 11.1 与现有 Web 端的差异

| 功能 | Web 端 | Electron 端 |
|------|--------|-------------|
| 文件来源 | 用户手动选择 | 自动监听目录 |
| 打包 | 前端/后端 | 客户端本地打包 |
| 项目绑定 | 无 | 本地目录 ↔ 线上项目 |
| 自动同步 | 不支持 | 支持 |
| 离线查看 | 不支持 | 支持查看本地列表 |

### 11.2 配置示例

```json
// config.json
{
  "server": {
    "baseURL": "https://axhost.example.com",
    "timeout": 30000
  },
  "watch": {
    "basePath": "/Users/xxx/Axure/Output",
    "excludePatterns": ["*.tmp", ".DS_Store", "__MACOSX"],
    "debounceMs": 2000
  },
  "sync": {
    "autoSync": true,
    "syncMode": "immediate",
    "confirmBeforeUpload": true
  },
  "ui": {
    "theme": "system",
    "language": "zh-CN",
    "minimizeToTray": true
  }
}
```

---

**结论**：该方案完全可行，技术栈成熟，开发成本可控。建议优先实现 Phase 1 的 MVP 版本验证用户价值。
