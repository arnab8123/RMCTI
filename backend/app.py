import os
from flask import Flask,jsonify,send_from_directory,send_file,redirect
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from sqlalchemy.exc import SQLAlchemyError
from .config import Config
from .database import db
from .routes import api
def create_app():
    app=Flask(__name__);app.config.from_object(Config);db.init_app(app);JWTManager(app);CORS(app,resources={r"/api/*":{"origins":app.config["CORS_ORIGINS"]},r"/uploads/*":{"origins":app.config["CORS_ORIGINS"]}});app.register_blueprint(api)
    frontend_dir=os.path.abspath(os.path.join(os.path.dirname(__file__),"..","frontend"))

    @app.get("/health")
    def health():return jsonify(success=True,message="API is healthy")

    @app.get("/uploads/photos/<path:filename>")
    def uploaded_photo(filename):
        # Legacy compatibility endpoint. New records return Cloudinary URLs
        # directly, so browsers do not hit Render for the image at all.
        try:
            from .models import PhotoAsset
            asset=PhotoAsset.query.filter_by(id=filename).first()
            if asset:
                from flask import Response
                return Response(asset.data,mimetype=asset.mime_type,headers={"Cache-Control":"public, max-age=31536000, immutable"})
        except Exception:
            pass
        return send_from_directory(os.path.join(os.path.dirname(__file__),"uploads","photos"),filename)

    # Serve the frontend from the same Flask service as the API. This keeps
    # relative /api calls working in production as well as locally.
    @app.get("/")
    def frontend_home():
        return send_file(os.path.join(frontend_dir,"index.html"))

    @app.get("/<path:path>")
    def frontend_files(path):
        target=os.path.abspath(os.path.join(frontend_dir,path))
        if target.startswith(frontend_dir+os.sep) and os.path.isfile(target):
            return send_file(target)
        return jsonify(success=False,message="Resource not found"),404

    @app.errorhandler(404)
    def no(_):return jsonify(success=False,message="Resource not found"),404
    @app.errorhandler(SQLAlchemyError)
    def dberr(_):db.session.rollback();return jsonify(success=False,message="Database operation failed"),500

    # Database creation/schema migrations are intentionally NOT run here.
    # Render runs scripts/migrate.py during the build phase so every Gunicorn
    # worker starts serving traffic without inspecting or altering the remote DB.
    return app
app=create_app()
if __name__=="__main__":app.run(host="127.0.0.1",port=int(os.getenv("PORT",5000)),debug=True)
