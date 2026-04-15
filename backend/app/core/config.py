from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Agentic AI Property Valuation and Property Designation Assistant"
    version: str = "0.1.0"
    mock_mode: bool = True
    jwt_secret: str = "change-me-in-prod"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
