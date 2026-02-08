from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://axhost:axhost_password@localhost:5432/axhost"
    SECRET_KEY: str = "your-secret-key-change-this-in-production"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 30
    
    class Config:
        env_file = ".env"

settings = Settings()
