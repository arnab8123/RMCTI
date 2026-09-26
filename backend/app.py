import os
from flask import Flask, jsonify, send_from_directory, send_file
from flask_cors import CORS
from flask_jwt_extended import JWTManager, get_jwt
from sqlalchemy.exc import SQLAlchemyError
from .config import Config
from .database import db
from .routes import api
from .extensions import limiter


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)

    jwt = JWTManager(app)

    limiter.init_app(app)
    app.extensions["limiter"] = limiter

    CORS(
        app,
        resources={
            r"/api/*": {"origins": app.config["CORS_ORIGINS"]},
            r"/uploads/*": {"origins": app.config["CORS_ORIGINS"]},
        },
    )
    app.register_blueprint(api)

    @jwt.token_in_blocklist_loader
    def is_token_revoked(jwt_header, jwt_payload):
        from .models import TokenBlocklist
        return TokenBlocklist.query.filter_by(jti=jwt_payload["jti"]).first() is not None

    @jwt.unauthorized_loader
    def unauthorized(message):
        return jsonify(success=False, message="Authentication required"), 401

    @jwt.invalid_token_loader
    def invalid_token(message):
        return jsonify(success=False, message="Invalid authentication token"), 401

    @jwt.expired_token_loader
    def expired_token(jwt_header, jwt_payload):
        return jsonify(success=False, message="Session expired. Please log in again."), 401

    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

    @app.get("/health")
    def health():
        return jsonify(success=True, message="API is healthy")

    @app.get("/uploads/photos/<path:filename>")
    def uploaded_photo(filename):
        try:
            from .models import PhotoAsset
            asset = PhotoAsset.query.filter_by(id=filename).first()
            if asset:
                from flask import Response
                return Response(
                    asset.data,
                    mimetype=asset.mime_type,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"},
                )
        except Exception:
            db.session.rollback()
        return send_from_directory(
            os.path.join(os.path.dirname(__file__), "uploads", "photos"), filename
        )

    @app.get("/")
    def frontend_home():
        return send_file(os.path.join(frontend_dir, "index.html"))

    @app.get("/<path:path>")
    def frontend_files(path):
        target = os.path.abspath(os.path.join(frontend_dir, path))
        if target.startswith(frontend_dir + os.sep) and os.path.isfile(target):
            response = send_file(target)
            # Long cache only for versioned/static assets. HTML remains revalidated.
            if path.lower().endswith((".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2")):
                response.headers["Cache-Control"] = "public, max-age=31536000, stale-while-revalidate=604800"
            return response
        return jsonify(success=False, message="Resource not found"), 404

    @app.errorhandler(404)
    def no(_):
        return jsonify(success=False, message="Resource not found"), 404

    @app.errorhandler(413)
    def too_large(_):
        return jsonify(success=False, message="Request is too large"), 413

    @app.errorhandler(SQLAlchemyError)
    def dberr(_):
        db.session.rollback()
        return jsonify(success=False, message="Database operation failed"), 500

    @app.after_request
    def security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        # Render terminates HTTPS in production. Only send HSTS when the
        # request was HTTPS so local development is not accidentally pinned.
        if os.getenv("ENABLE_HSTS", "1").strip().lower() in {"1", "true", "yes", "on"} and request_is_https(response):
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    return app


def request_is_https(response):
    # Render supplies X-Forwarded-Proto. Import lazily to keep module imports simple.
    from flask import request
    return request.is_secure or request.headers.get("X-Forwarded-Proto", "").lower() == "https"


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", 5000)), debug=True)
