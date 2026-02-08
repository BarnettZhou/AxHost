FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 创建 uploads 目录
RUN mkdir -p /app/uploads

# 复制应用代码（生产环境使用，开发环境会被挂载覆盖）
COPY ./app /app/app

EXPOSE 8000

# 默认命令（会被 docker-compose 覆盖）
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
