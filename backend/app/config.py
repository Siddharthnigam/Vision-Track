import os

from dotenv import load_dotenv

load_dotenv(override=True)


class Settings:
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def __init__(self) -> None:
        self.DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./visiontrack.db").strip()
        self.GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
        self.GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
        self.JWT_SECRET: str = os.getenv(
            "JWT_SECRET", "visiontrack-dev-secret-change-me"
        ).strip()
        self.JWT_ALGORITHM: str = "HS256"
        self.JWT_EXPIRES_MINUTES: int = int(os.getenv("JWT_EXPIRES_MINUTES", "1440"))
        self.PORT: int = int(os.getenv("PORT", "8000"))

        raw_origins = os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://localhost:5174,https://vision-track-mu.vercel.app",
        )
        self.ALLOWED_ORIGINS: list[str] = [
            origin.strip()
            for origin in raw_origins.split(",")
            if origin.strip()
        ]

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


settings = Settings()