import hashlib
import secrets
from datetime import datetime, timedelta
from jose import JWTError, jwt
from app.core.config import settings

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码（使用 SHA256 + salt）"""
    if not hashed_password or ':' not in hashed_password:
        return False
    salt, hash_value = hashed_password.split(':', 1)
    computed = hashlib.sha256((plain_password + salt).encode()).hexdigest()
    return secrets.compare_digest(computed, hash_value)

def get_password_hash(password: str) -> str:
    """生成密码哈希（使用 SHA256 + salt）"""
    salt = secrets.token_hex(16)
    hash_value = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{hash_value}"

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")
    return encoded_jwt

def decode_token(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        return payload
    except JWTError:
        return None
