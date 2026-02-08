#!/usr/bin/env python3
"""
数据迁移脚本：从旧版 Flask/MySQL 迁移到新版 FastAPI/PostgreSQL

使用方法:
1. 确保旧版数据库可访问
2. 运行: python scripts/migrate.py
"""

import os
import sys
import uuid
from datetime import datetime

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

def migrate():
    """执行数据迁移"""
    
    # 连接配置（根据实际情况修改）
    OLD_DB_URL = os.getenv("OLD_DATABASE_URL", "mysql+pymysql://root:1qaz2wsx@localhost:3307/axure-web")
    NEW_DB_URL = os.getenv("DATABASE_URL", "postgresql://axhost:axhost_password@localhost:5432/axhost")
    
    print("=" * 60)
    print("AxHost 数据迁移工具")
    print("=" * 60)
    print(f"\n源数据库: MySQL")
    print(f"目标数据库: PostgreSQL")
    print()
    
    try:
        # 连接旧数据库
        print("[1/4] 连接旧数据库...")
        old_engine = create_engine(OLD_DB_URL)
        OldSession = sessionmaker(bind=old_engine)
        old_db = OldSession()
        
        # 连接新数据库
        print("[2/4] 连接新数据库...")
        new_engine = create_engine(NEW_DB_URL)
        NewSession = sessionmaker(bind=new_engine)
        new_db = NewSession()
        
        # 获取旧数据
        print("[3/4] 读取旧数据...")
        old_projects = old_db.execute(text("SELECT * FROM projects")).fetchall()
        print(f"      找到 {len(old_projects)} 个项目")
        
        # 创建默认管理员（如果不存在）
        print("[4/4] 迁移数据...")
        
        # 检查是否已有管理员
        admin_exists = new_db.execute(text("SELECT id FROM users WHERE role = 'admin' LIMIT 1")).fetchone()
        
        if not admin_exists:
            print("      创建默认管理员账户...")
            new_db.execute(text("""
                INSERT INTO users (name, employee_id, password_hash, role, status, created_at)
                VALUES ('管理员', 'admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYA.qGZvKG6', 'admin', 'active', NOW())
            """))
            new_db.commit()
        
        # 获取管理员ID作为默认作者
        admin_id = new_db.execute(text("SELECT id FROM users WHERE role = 'admin' LIMIT 1")).fetchone()[0]
        
        # 迁移项目
        migrated_count = 0
        for old_project in old_projects:
            try:
                # 检查是否已存在
                exists = new_db.execute(
                    text("SELECT id FROM projects WHERE object_id = :object_id"),
                    {"object_id": old_project.object_id}
                ).fetchone()
                
                if exists:
                    print(f"      跳过已存在: {old_project.name}")
                    continue
                
                # 插入新项目
                new_db.execute(text("""
                    INSERT INTO projects (object_id, name, author_id, view_password, is_public, created_at, updated_at)
                    VALUES (:object_id, :name, :author_id, NULL, TRUE, :created_at, :updated_at)
                """), {
                    "object_id": old_project.object_id,
                    "name": old_project.name,
                    "author_id": admin_id,
                    "created_at": old_project.created_at,
                    "updated_at": old_project.updated_at
                })
                
                migrated_count += 1
                print(f"      已迁移: {old_project.name}")
                
            except Exception as e:
                print(f"      迁移失败 {old_project.name}: {str(e)}")
        
        new_db.commit()
        
        print()
        print("=" * 60)
        print(f"迁移完成！成功迁移 {migrated_count} 个项目")
        print("=" * 60)
        print()
        print("说明:")
        print("- 所有项目默认设置为公开（无密码）")
        print("- 所有项目作者设置为默认管理员")
        print("- 请在管理后台手动调整权限和密码")
        print()
        
    except Exception as e:
        print(f"\n错误: {str(e)}")
        sys.exit(1)
    finally:
        if 'old_db' in locals():
            old_db.close()
        if 'new_db' in locals():
            new_db.close()

if __name__ == "__main__":
    migrate()
