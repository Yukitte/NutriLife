from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "nutrilife_dev"
    cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500"
    jwt_secret_key: str = Field(
        default="local-development-secret-key-change-before-deploy",
        min_length=32,
    )
    access_token_expire_minutes: int = Field(default=30, ge=5, le=1440)
    password_reset_expire_minutes: int = Field(default=15, ge=5, le=60)
    frontend_base_url: str = "http://localhost:5500"
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def validate_production_secrets(self) -> None:
        if self.app_env.lower() == "production" and self.jwt_secret_key.startswith(
            ("local-development-", "generate-")
        ):
            raise ValueError("Configure uma chave JWT exclusiva para produção.")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_production_secrets()
    return settings
