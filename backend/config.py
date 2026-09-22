import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


def _env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", SECRET_KEY)

    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=int(os.getenv("JWT_EXPIRES_MINUTES", "30"))
    )
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_ERROR_MESSAGE_KEY = "message"

    # Reject unexpectedly large request bodies before Flask parses them.
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(3 * 1024 * 1024)))

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://"
        f"{os.getenv('DB_USER', 'root')}:"
        f"{os.getenv('DB_PASSWORD', '')}@"
        f"{os.getenv('DB_HOST', 'localhost')}:"
        f"{os.getenv('DB_PORT', '3306')}/"
        f"{os.getenv('DB_NAME', 'tuition_management')}"
        f"?charset=utf8mb4"
    )

    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "pool_size": int(os.getenv("DB_POOL_SIZE", "5")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "5")),
        "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", "30")),
        "connect_args": {
            "ssl": {"check_hostname": False},
            "init_command": "SET time_zone = '+00:00'",
        },
    }

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    PHOTO_STORAGE = os.getenv("PHOTO_STORAGE", "cloudinary").strip().lower()
    CLOUDINARY_FOLDER = os.getenv("CLOUDINARY_FOLDER", "rmcti/photos")

    CORS_ORIGINS = [
        x.strip()
        for x in os.getenv(
            "CORS_ORIGINS",
            "http://127.0.0.1:5500,http://localhost:5500",
        ).split(",")
        if x.strip()
    ]

    # Flask-Limiter uses memory:// by default so the app works without another
    # service. For multi-instance production deployments, set a shared
    # RATELIMIT_STORAGE_URI such as a Redis URI.
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_DEFAULT = os.getenv("RATELIMIT_DEFAULT", "1000 per hour")
    RATELIMIT_HEADERS_ENABLED = True

    SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", True)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
