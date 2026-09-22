import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
    JWT_SECRET_KEY = SECRET_KEY

    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=int(os.getenv("JWT_EXPIRES_MINUTES", "120"))
    )

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://"
        f"{os.getenv('DB_USER', 'root')}:"
        f"{os.getenv('DB_PASSWORD', '')}@"
        f"{os.getenv('DB_HOST', 'localhost')}:"
        f"{os.getenv('DB_PORT', '3306')}/"
        f"{os.getenv('DB_NAME', 'tuition_management')}"
        f"?charset=utf8mb4"
    )

    # Reuse Aiven connections instead of opening a new TCP/TLS connection for
    # every request. pool_pre_ping keeps stale remote connections from failing
    # after Aiven/Render idle timeouts.
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "pool_size": int(os.getenv("DB_POOL_SIZE", "5")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "5")),
        "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", "30")),
        "connect_args": {
            "ssl": {"check_hostname": False},
            # Keep database CURRENT_TIMESTAMP values in UTC; the app displays them in IST.
            "init_command": "SET time_zone = '+00:00'"
        }
    }

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Photos are stored in Cloudinary in production instead of MySQL BLOBs.
    # Set CLOUDINARY_URL in Render. Existing MySQL photo_assets remain a
    # compatibility fallback until migrate_photos.py is run.
    PHOTO_STORAGE = os.getenv("PHOTO_STORAGE", "cloudinary").strip().lower()
    CLOUDINARY_FOLDER = os.getenv("CLOUDINARY_FOLDER", "rmcti/photos")

    CORS_ORIGINS = [
        x.strip()
        for x in os.getenv(
            "CORS_ORIGINS",
            "http://127.0.0.1:5500,http://localhost:5500"
        ).split(",")
        if x.strip()
    ]
