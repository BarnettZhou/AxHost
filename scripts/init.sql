-- 初始化数据库

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'product_manager', 'developer')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建原型表
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    object_id VARCHAR(36) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    author_id INTEGER REFERENCES users(id),
    view_password VARCHAR(18),
    is_public BOOLEAN DEFAULT FALSE,
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 如果表已存在，添加 remark 字段
ALTER TABLE projects ADD COLUMN IF NOT EXISTS remark TEXT;

-- 创建访问记录表
CREATE TABLE IF NOT EXISTS project_access (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id)
);

-- 创建标签表
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(16) UNIQUE NOT NULL,
    emoji VARCHAR(32),
    color VARCHAR(7) NOT NULL DEFAULT '#D3D3D3',
    creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建项目标签关联表
CREATE TABLE IF NOT EXISTS project_tags (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE(project_id, tag_id)
);

-- 创建用户常用标签表
CREATE TABLE IF NOT EXISTS user_common_tags (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tag_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_projects_author ON projects(author_id);
CREATE INDEX IF NOT EXISTS idx_projects_object_id ON projects(object_id);
CREATE INDEX IF NOT EXISTS idx_project_access_user ON project_access(user_id);
CREATE INDEX IF NOT EXISTS idx_project_access_project ON project_access(project_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_creator ON tags(creator_id);
CREATE INDEX IF NOT EXISTS idx_project_tags_project ON project_tags(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tags_tag ON project_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_user_common_tags_user ON user_common_tags(user_id);

-- 插入默认管理员账户 (密码: admin123)
-- 使用 SHA256+salt 格式: salt:hash
INSERT INTO users (name, employee_id, password_hash, role, status)
VALUES ('管理员', 'admin', '872b165a22525e23c50474613e4b012c:d128c00e80d92287445e993637a9a598b91ae41b05c2e30e1e6c123fcb3ab694', 'admin', 'active')
ON CONFLICT (employee_id) DO NOTHING;
