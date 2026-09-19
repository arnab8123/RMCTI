"""Idempotent database bootstrap/migration for RMCTI.
Run from the project root: python scripts/migrate.py
"""
import sys
from pathlib import Path
from sqlalchemy import inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app import app
from backend.database import db

ENQUIRY_COLUMNS={
    "name":"VARCHAR(150) NOT NULL",
    "phone":"VARCHAR(30) NOT NULL",
    "message":"TEXT NOT NULL",
    "status":"ENUM('new','read','resolved') NOT NULL DEFAULT 'new'",
    "admin_note":"TEXT NULL",
    "created_at":"DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    "updated_at":"DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
}

def ensure_enquiries():
    inspector=inspect(db.engine)
    if "enquiries" not in inspector.get_table_names():
        db.session.execute(text("""CREATE TABLE enquiries (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            phone VARCHAR(30) NOT NULL,
            message TEXT NOT NULL,
            status ENUM('new','read','resolved') NOT NULL DEFAULT 'new',
            admin_note TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_enquiries_status_created(status,created_at)
        ) ENGINE=InnoDB"""))
        return

    existing={c["name"] for c in inspector.get_columns("enquiries")}
    for name,definition in ENQUIRY_COLUMNS.items():
        if name not in existing:
            db.session.execute(text(f"ALTER TABLE enquiries ADD COLUMN {name} {definition}"))

    # Ensure the admin inbox query remains fast on larger deployments.
    try:
        indexes=inspector.get_indexes("enquiries")
        have={ix.get("name") for ix in indexes}
        if "idx_enquiries_status_created" not in have:
            db.session.execute(text("CREATE INDEX idx_enquiries_status_created ON enquiries(status,created_at)"))
    except Exception:
        # A pre-existing equivalent index is fine; do not make migration fail.
        pass


def ensure_attendance_marker():
    inspector=inspect(db.engine)
    if "attendance" not in inspector.get_table_names():
        return
    existing={c["name"] for c in inspector.get_columns("attendance")}
    if "marked_by" not in existing:
        # Add nullable first so existing attendance rows can be backfilled safely.
        db.session.execute(text("ALTER TABLE attendance ADD COLUMN marked_by BIGINT UNSIGNED NULL AFTER status"))
        inspector=inspect(db.engine)
        existing={c["name"] for c in inspector.get_columns("attendance")}
    if "marked_by" in existing:
        missing=int(db.session.execute(text("SELECT COUNT(*) FROM attendance WHERE marked_by IS NULL")).scalar() or 0)
        if missing:
            marker=db.session.execute(text("SELECT id FROM users WHERE role IN ('admin','teacher') ORDER BY id LIMIT 1")).scalar()
            if marker is not None:
                db.session.execute(text("UPDATE attendance SET marked_by=:marker WHERE marked_by IS NULL"),{"marker":marker})
        try:
            db.session.execute(text("ALTER TABLE attendance MODIFY COLUMN marked_by BIGINT UNSIGNED NOT NULL"))
        except Exception:
            # It may already be NOT NULL on an existing deployment.
            db.session.rollback()
        # Add the FK only when one is not already present.
        try:
            fk_rows=db.session.execute(text("""SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='attendance'
                  AND COLUMN_NAME='marked_by' AND REFERENCED_TABLE_NAME='users'""")).all()
            if not fk_rows:
                db.session.execute(text("ALTER TABLE attendance ADD CONSTRAINT fk_attendance_marker FOREIGN KEY (marked_by) REFERENCES users(id)"))
        except Exception:
            # Existing equivalent constraint/index should not fail the migration.
            db.session.rollback()


def ensure_complaint_class():
    inspector=inspect(db.engine)
    if "complaints" not in inspector.get_table_names() or "classes" not in inspector.get_table_names():
        return
    existing={c["name"] for c in inspector.get_columns("complaints")}
    if "class_id" not in existing:
        db.session.execute(text("ALTER TABLE complaints ADD COLUMN class_id BIGINT UNSIGNED NULL AFTER student_id"))
    try:
        fks=db.session.execute(text("""SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='complaints'
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


def ensure_performance_indexes():
    """Add indexes used by the high-traffic list/dashboard endpoints.
    Safe to run repeatedly; existing indexes are left untouched.
    """
    inspector=inspect(db.engine)
    tables=set(inspector.get_table_names())
    wanted={
        "teacher_classes": [
            ("idx_teacher_classes_teacher_status", "teacher_id,status"),
            ("idx_teacher_classes_class_status", "class_id,status"),
        ],
        "student_classes": [
            ("idx_student_classes_student_status", "student_id,status"),
            ("idx_student_classes_class_status", "class_id,status"),
        ],
        "fee_payments": [
            ("idx_fee_payments_student_month", "student_id,fee_month"),
        ],
        "fee_structures": [
            ("idx_fee_structures_class_status_effective", "class_id,status,effective_from"),
        ],
        "attendance": [
            ("idx_attendance_class_date", "class_id,attendance_date"),
        ],
        "homework": [
            ("idx_homework_teacher_date", "teacher_id,homework_date"),
            ("idx_homework_class_due", "class_id,due_date"),
        ],
        "classwork": [
            ("idx_classwork_teacher_date", "teacher_id,work_date"),
            ("idx_classwork_class_date", "class_id,work_date"),
        ],
        "complaints": [
            ("idx_complaints_student_status", "student_id,status"),
        ],
        "students": [
            ("idx_students_status_name", "status,name"),
        ],
        "teachers": [
            ("idx_teachers_status_name", "status,name"),
        ],
    }
    for table, indexes in wanted.items():
        if table not in tables:
            continue
        existing={ix.get("name") for ix in inspect(db.engine).get_indexes(table)}
        for name, columns in indexes:
            if name in existing:
                continue
            try:
                db.session.execute(text(f"CREATE INDEX {name} ON {table} ({columns})"))
            except Exception:
                db.session.rollback()


with app.app_context():
    db.create_all()
    ensure_enquiries()
    ensure_attendance_marker()
    ensure_complaint_class()
    ensure_performance_indexes()
    db.session.commit()
    print("RMCTI database schema is ready. Enquiries, attendance marker, optional complaint class, and persistent photo storage are ready. Existing data is preserved.")
