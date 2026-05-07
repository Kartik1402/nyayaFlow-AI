import re
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = Field("postgresql+psycopg2://postgres:postgres@localhost:15432/courtcases", env="DATABASE_URL")
    openai_api_key: str | None = Field(None, env="OPENAI_API_KEY")
    llm_api_key: str | None = Field(None, env="LLM_API_KEY")
    llm_provider: str = Field("mistral", env="LLM_PROVIDER")
    llm_model: str = Field("chatit", env="LLM_MODEL")
    llm_base_url: str | None = Field(None, env="LLM_BASE_URL")
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"], env="ALLOWED_ORIGINS")
    upload_dir: str = Field("uploads", env="UPLOADS_DIR")

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value):
        if isinstance(value, str):
            return [item.strip() for item in re.split(r"[;,\s]+", value) if item.strip()]
        return value

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
