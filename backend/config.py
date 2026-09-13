import os
from datetime import timedelta
from dotenv import load_dotenv
load_dotenv()
class Config:
    SECRET_KEY=os.getenv("SECRET_KEY","change-me")
    JWT_SECRET_KEY=SECRET_KEY
    JWT_ACCESS_TOKEN_EXPIRES=timedelta(minutes=int(os.getenv("JWT_EXPIRES_MINUTES","120")))
    SQLALCHEMY_DATABASE_URI=f"mysql+pymysql://{os.getenv('DB_USER','root')}:{os.getenv('DB_PASSWORD','')}@{os.getenv('DB_HOST','localhost')}:{os.getenv('DB_PORT','3306')}/{os.getenv('DB_NAME','tuition_management')}?charset=utf8mb4"

SQLALCHEMY_ENGINE_OPTIONS = {
    "connect_args": {
        "ssl": {
            "check_hostname": False
        }
    }
}
    SQLALCHEMY_TRACK_MODIFICATIONS=False
    CORS_ORIGINS=[x.strip() for x in os.getenv("CORS_ORIGINS","http://127.0.0.1:5500,http://localhost:5500").split(",") if x.strip()]
