import os
from flask import Flask,jsonify,send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from sqlalchemy.exc import SQLAlchemyError
from .config import Config
from .database import db
from .routes import api
def create_app():
    app=Flask(__name__);app.config.from_object(Config);db.init_app(app);JWTManager(app);CORS(app,resources={r"/api/*":{"origins":app.config["CORS_ORIGINS"]}});app.register_blueprint(api)
    @app.get("/health")
    def health():return jsonify(success=True,message="API is healthy")
    @app.get("/uploads/photos/<path:filename>")
    def uploaded_photo(filename):
        return send_from_directory(os.path.join(os.path.dirname(__file__),"uploads","photos"),filename)
    @app.errorhandler(404)
    def no(_):return jsonify(success=False,message="Resource not found"),404
    @app.errorhandler(SQLAlchemyError)
    def dberr(_):db.session.rollback();return jsonify(success=False,message="Database operation failed"),500
    return app
app=create_app()
if __name__=="__main__":app.run(host="127.0.0.1",port=int(os.getenv("PORT",5000)),debug=True)
