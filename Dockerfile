FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 代码放在 /app/app 目录下，以支持 from app.XXX 导入
COPY ./app /app/app

EXPOSE 8000
