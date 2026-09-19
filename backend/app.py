import os
from flask import Flask,jsonify,send_from_directory,send_file
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
        # Prefer the persistent database copy. Existing disk-backed files are
        # kept as a compatibility fallback for older RMCTI records.
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

    # Bootstrap missing tables and safely add any missing enquiry columns.
    # This preserves existing data and prevents a deployed old schema from
    # breaking the public Contact form or the Admin Enquire inbox.
    with app.app_context():
        try:
            db.create_all()
            from sqlalchemy import inspect, text

            # One-time compatibility bridge for existing local uploads. If a
            # teacher/student still points at a legacy disk file, keep serving
            # it from disk; when the file is present, also copy it into the
            # durable photo_assets table so later restarts no longer depend on
            # that filesystem location.
            try:
                from .models import PhotoAsset, Teacher, Student
                photo_dir=os.path.join(os.path.dirname(__file__),"uploads","photos")
                for person in Teacher.query.with_entities(Teacher.photo).filter(Teacher.photo.isnot(None)).all() + Student.query.with_entities(Student.photo).filter(Student.photo.isnot(None)).all():
                    ref=person[0]
                    if not ref or "/uploads/photos/" not in str(ref):
                        continue
                    filename=str(ref).split("/uploads/photos/")[-1].split("?")[0]
                    path=os.path.join(photo_dir,os.path.basename(filename))
                    if os.path.isfile(path) and not PhotoAsset.query.filter_by(id=os.path.basename(filename)).first():
                        mime={".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp"}.get(os.path.splitext(path)[1].lower(),"application/octet-stream")
                        with open(path,"rb") as pf:
                            db.session.add(PhotoAsset(id=os.path.basename(filename),mime_type=mime,data=pf.read()))
                db.session.commit()
            except Exception:
                db.session.rollback()
            inspector=inspect(db.engine)
            if "enquiries" in inspector.get_table_names():
                existing={c["name"] for c in inspector.get_columns("enquiries")}
                columns={
                    "name":"VARCHAR(150) NOT NULL",
                    "phone":"VARCHAR(30) NOT NULL",
                    "message":"TEXT NOT NULL",
                    "status":"ENUM('new','read','resolved') NOT NULL DEFAULT 'new'",
                    "admin_note":"TEXT NULL",
                    "created_at":"DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
                    "updated_at":"DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
                }
                for name,definition in columns.items():
                    if name not in existing:
                        db.session.execute(text(f"ALTER TABLE enquiries ADD COLUMN {name} {definition}"))
                try:
                    indexes={ix.get("name") for ix in inspector.get_indexes("enquiries")}
                    if "idx_enquiries_status_created" not in indexes:
                        db.session.execute(text("CREATE INDEX idx_enquiries_status_created ON enquiries(status,created_at)"))
                except Exception:
                    pass
                db.session.commit()

            # Complaints may optionally retain the class the student chose to mention.
            if "complaints" in inspector.get_table_names() and "classes" in inspector.get_table_names():
                complaint_cols={c["name"] for c in inspector.get_columns("complaints")}
                if "class_id" not in complaint_cols:
                    db.session.execute(text("ALTER TABLE complaints ADD COLUMN class_id BIGINT UNSIGNED NULL AFTER student_id"))
                    db.session.commit()
                try:
                    fks=db.session.execute(text("""SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
                        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='complaints'
                          AND COLUMN_NAME='class_id' AND REFERENCED_TABLE_NAME='classes'""")).all()
                    if not fks:
                        db.session.execute(text("ALTER TABLE complaints ADD CONSTRAINT fk_complaints_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL"))
                except Exception:
                    db.session.rollback()
                try:
                    indexes={ix.get("name") for ix in inspect(db.engine).get_indexes("complaints")}
                    if "idx_complaints_class_id" not in indexes:
                        db.session.execute(text("CREATE INDEX idx_complaints_class_id ON complaints(class_id)"))
                except Exception:
                    db.session.rollback()
                db.session.commit()

            # Ensure legacy attendance rows can record who marked attendance.
            if "attendance" in inspector.get_table_names():
                attendance_cols={c["name"] for c in inspector.get_columns("attendance")}
                if "marked_by" not in attendance_cols:
                    db.session.execute(text("ALTER TABLE attendance ADD COLUMN marked_by BIGINT UNSIGNED NULL AFTER status"))
                    attendance_cols={"marked_by"} | attendance_cols
                if "marked_by" in attendance_cols:
                    missing=int(db.session.execute(text("SELECT COUNT(*) FROM attendance WHERE marked_by IS NULL")).scalar() or 0)
                    if missing:
                        marker=db.session.execute(text("SELECT id FROM users WHERE role IN ('admin','teacher') ORDER BY id LIMIT 1")).scalar()
                        if marker is not None:
                            db.session.execute(text("UPDATE attendance SET marked_by=:marker WHERE marked_by IS NULL"),{"marker":marker})
                    try:
                        db.session.execute(text("ALTER TABLE attendance MODIFY COLUMN marked_by BIGINT UNSIGNED NOT NULL"))
                    except Exception:
                        db.session.rollback()
                    try:
                        fks=db.session.execute(text("""SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendance' AND COLUMN_NAME='marked_by' AND REFERENCED_TABLE_NAME='users'""")).all()
                        if not fks:
                            db.session.execute(text("ALTER TABLE attendance ADD CONSTRAINT fk_attendance_marker FOREIGN KEY (marked_by) REFERENCES users(id)"))
                    except Exception:
                        db.session.rollback()
                db.session.commit()
        except Exception as exc:
            db.session.rollback()
            app.logger.warning("Database bootstrap skipped: %s",exc)
    return app
app=create_app()
if __name__=="__main__":app.run(host="127.0.0.1",port=int(os.getenv("PORT",5000)),debug=True)
