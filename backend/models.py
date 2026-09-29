from datetime import datetime
from sqlalchemy.dialects.mysql import MEDIUMBLOB
from .database import db
class User(db.Model):
    __tablename__="users"; id=db.Column(db.BigInteger,primary_key=True); username=db.Column(db.String(100),unique=True,nullable=False); password_hash=db.Column(db.String(255),nullable=False); role=db.Column(db.Enum("admin","teacher","student"),nullable=False); is_active=db.Column(db.Boolean,default=True,nullable=False); created_at=db.Column(db.DateTime,default=datetime.utcnow); updated_at=db.Column(db.DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
class TokenBlocklist(db.Model):
    """Revoked JWT IDs. Keeps logout effective until the access token expires."""
    __tablename__="token_blocklist"
    jti=db.Column(db.String(36),primary_key=True)
    user_id=db.Column(db.BigInteger,db.ForeignKey("users.id",ondelete="CASCADE"),nullable=False)
    revoked_at=db.Column(db.DateTime,default=datetime.utcnow,nullable=False)
    expires_at=db.Column(db.DateTime,nullable=True)
    __table_args__=(db.Index("idx_token_blocklist_user","user_id"),)

class Admin(db.Model):
    __tablename__="admins"; id=db.Column(db.BigInteger,primary_key=True); user_id=db.Column(db.BigInteger,db.ForeignKey("users.id"),unique=True,nullable=False); name=db.Column(db.String(150),nullable=False); email=db.Column(db.String(255)); phone=db.Column(db.String(30))
class Teacher(db.Model):
    __tablename__="teachers"; id=db.Column(db.BigInteger,primary_key=True); user_id=db.Column(db.BigInteger,db.ForeignKey("users.id"),unique=True,nullable=False); teacher_id=db.Column(db.String(30),unique=True,nullable=False); name=db.Column(db.String(150),nullable=False); photo=db.Column(db.String(500)); gender=db.Column(db.String(30)); dob=db.Column(db.Date); phone=db.Column(db.String(30)); email=db.Column(db.String(255)); address=db.Column(db.Text); qualification=db.Column(db.String(255)); experience=db.Column(db.String(100)); aadhaar_number=db.Column(db.String(20)); joining_date=db.Column(db.Date); status=db.Column(db.Enum("active","inactive"),default="active",nullable=False); created_at=db.Column(db.DateTime,default=datetime.utcnow); updated_at=db.Column(db.DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
class Parent(db.Model):
    __tablename__="parents"; id=db.Column(db.BigInteger,primary_key=True); name=db.Column(db.String(150),nullable=False); relationship=db.Column(db.String(80)); phone=db.Column(db.String(30)); email=db.Column(db.String(255)); address=db.Column(db.Text)
class Student(db.Model):
    __tablename__="students"; id=db.Column(db.BigInteger,primary_key=True); user_id=db.Column(db.BigInteger,db.ForeignKey("users.id"),unique=True,nullable=False); student_id=db.Column(db.String(30),unique=True,nullable=False); name=db.Column(db.String(150),nullable=False); photo=db.Column(db.String(500)); gender=db.Column(db.String(30)); dob=db.Column(db.Date); phone=db.Column(db.String(30)); address=db.Column(db.Text); school_name=db.Column(db.String(255)); aadhaar_number=db.Column(db.String(20)); admission_date=db.Column(db.Date); status=db.Column(db.Enum("active","inactive"),default="active",nullable=False); parent_id=db.Column(db.BigInteger,db.ForeignKey("parents.id"))
class Subject(db.Model):
    __tablename__="subjects"; id=db.Column(db.BigInteger,primary_key=True); name=db.Column(db.String(100),unique=True,nullable=False); is_active=db.Column(db.Boolean,default=True)
class Class(db.Model):
    __tablename__="classes"; id=db.Column(db.BigInteger,primary_key=True); class_name=db.Column(db.String(100),nullable=False); batch=db.Column(db.String(100),nullable=False); subject_id=db.Column(db.BigInteger,db.ForeignKey("subjects.id"),nullable=False); room=db.Column(db.String(100)); max_students=db.Column(db.Integer,default=30); status=db.Column(db.Enum("active","inactive"),default="active",nullable=False); created_at=db.Column(db.DateTime,default=datetime.utcnow); updated_at=db.Column(db.DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
class TeacherClass(db.Model):
    __tablename__="teacher_classes"; id=db.Column(db.BigInteger,primary_key=True); teacher_id=db.Column(db.BigInteger,db.ForeignKey("teachers.id"),nullable=False); class_id=db.Column(db.BigInteger,db.ForeignKey("classes.id"),nullable=False); day_of_week=db.Column(db.Integer,nullable=False); start_time=db.Column(db.Time,nullable=False); end_time=db.Column(db.Time,nullable=False); status=db.Column(db.Enum("active","inactive"),default="active",nullable=False); created_at=db.Column(db.DateTime,default=datetime.utcnow); updated_at=db.Column(db.DateTime,default=datetime.utcnow,onupdate=datetime.utcnow); __table_args__=(db.Index("idx_teacher_classes_teacher_status","teacher_id","status"),db.Index("idx_teacher_classes_class_status","class_id","status"))

class ScheduleException(db.Model):
    __tablename__="schedule_exceptions"
    id=db.Column(db.BigInteger,primary_key=True)
    class_id=db.Column(db.BigInteger,db.ForeignKey("classes.id"),nullable=False)
    allocation_id=db.Column(db.BigInteger,db.ForeignKey("teacher_classes.id"),nullable=True)
    week_start=db.Column(db.Date,nullable=False)
    schedule_date=db.Column(db.Date,nullable=True)
    target_date=db.Column(db.Date,nullable=True)
    kind=db.Column(db.Enum("delete","reschedule","extra","weekly_time"),nullable=False)
    start_time=db.Column(db.Time,nullable=True)
    end_time=db.Column(db.Time,nullable=True)
    teacher_id=db.Column(db.BigInteger,db.ForeignKey("teachers.id"),nullable=True)
    created_by=db.Column(db.BigInteger,db.ForeignKey("users.id"),nullable=False)
    created_at=db.Column(db.DateTime,default=datetime.utcnow)
    __table_args__=(
        db.Index("idx_schedule_exceptions_class_week","class_id","week_start"),
        db.Index("idx_schedule_exceptions_class_target","class_id","target_date","kind"),
        db.Index("idx_schedule_exceptions_week_kind_date_teacher","week_start","kind","schedule_date","teacher_id"),
        db.Index("idx_schedule_exceptions_date_kind","schedule_date","kind")
    )

class StudentClass(db.Model):
    __tablename__="student_classes"; id=db.Column(db.BigInteger,primary_key=True); student_id=db.Column(db.BigInteger,db.ForeignKey("students.id"),nullable=False); class_id=db.Column(db.BigInteger,db.ForeignKey("classes.id"),nullable=False); assigned_at=db.Column(db.DateTime,default=datetime.utcnow); status=db.Column(db.Enum("active","inactive"),default="active",nullable=False); __table_args__=(db.Index("idx_student_classes_class_status","class_id","status"),db.Index("idx_student_classes_student_status","student_id","status"))
class FeeStructure(db.Model):
    __tablename__="fee_structures"; id=db.Column(db.BigInteger,primary_key=True); class_id=db.Column(db.BigInteger,db.ForeignKey("classes.id"),nullable=False); monthly_fee=db.Column(db.Numeric(10,2),nullable=False); effective_from=db.Column(db.Date,nullable=False); effective_to=db.Column(db.Date); status=db.Column(db.Enum("active","inactive"),default="active",nullable=False); created_by=db.Column(db.BigInteger,db.ForeignKey("users.id")); created_at=db.Column(db.DateTime,default=datetime.utcnow); updated_at=db.Column(db.DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
class FeePayment(db.Model):
    __tablename__="fee_payments"; id=db.Column(db.BigInteger,primary_key=True); student_id=db.Column(db.BigInteger,db.ForeignKey("students.id"),nullable=False); fee_month=db.Column(db.Date,nullable=False); amount=db.Column(db.Numeric(10,2),nullable=False); payment_date=db.Column(db.DateTime,default=datetime.utcnow); payment_method=db.Column(db.Enum("cash","upi","bank_transfer","other"),nullable=False); collected_by=db.Column(db.BigInteger,db.ForeignKey("users.id"),nullable=False); receipt_number=db.Column(db.String(50),unique=True,nullable=False); notes=db.Column(db.Text); __table_args__=(db.Index("idx_fee_payments_student_month_date","student_id","fee_month","payment_date"),db.Index("idx_fee_payments_month","fee_month"))
class Receipt(db.Model):
    __tablename__="receipts"; id=db.Column(db.BigInteger,primary_key=True); fee_payment_id=db.Column(db.BigInteger,db.ForeignKey("fee_payments.id"),unique=True,nullable=False); receipt_number=db.Column(db.String(50),unique=True,nullable=False); generated_at=db.Column(db.DateTime,default=datetime.utcnow)
class Homework(db.Model):
    __tablename__="homework"; id=db.Column(db.BigInteger,primary_key=True); class_id=db.Column(db.BigInteger,db.ForeignKey("classes.id"),nullable=False); teacher_id=db.Column(db.BigInteger,db.ForeignKey("teachers.id"),nullable=False); subject_id=db.Column(db.BigInteger,db.ForeignKey("subjects.id"),nullable=False); homework_date=db.Column(db.Date,nullable=False); due_date=db.Column(db.Date,nullable=False); title=db.Column(db.String(255),nullable=False); description=db.Column(db.Text,nullable=False); created_at=db.Column(db.DateTime,default=datetime.utcnow); updated_at=db.Column(db.DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
class Classwork(db.Model):
    __tablename__="classwork"; id=db.Column(db.BigInteger,primary_key=True); class_id=db.Column(db.BigInteger,db.ForeignKey("classes.id"),nullable=False); teacher_id=db.Column(db.BigInteger,db.ForeignKey("teachers.id"),nullable=False); subject_id=db.Column(db.BigInteger,db.ForeignKey("subjects.id"),nullable=False); work_date=db.Column(db.Date,nullable=False); topic=db.Column(db.String(255),nullable=False); description=db.Column(db.Text,nullable=False); notes=db.Column(db.Text); created_at=db.Column(db.DateTime,default=datetime.utcnow); updated_at=db.Column(db.DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
class Attendance(db.Model):
    __tablename__="attendance"
    id=db.Column(db.BigInteger,primary_key=True)
    student_id=db.Column(db.BigInteger,db.ForeignKey("students.id"),nullable=False)
    class_id=db.Column(db.BigInteger,db.ForeignKey("classes.id"),nullable=False)
    attendance_date=db.Column(db.Date,nullable=False)
    session_start_time=db.Column(db.Time,nullable=True)
    session_end_time=db.Column(db.Time,nullable=True)
    status=db.Column(db.Enum("present","absent"),nullable=False)
    marked_by=db.Column(db.BigInteger,db.ForeignKey("users.id"),nullable=False)
    created_at=db.Column(db.DateTime,default=datetime.utcnow)
    updated_at=db.Column(db.DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
    __table_args__=(db.UniqueConstraint("student_id","class_id","attendance_date","session_start_time","session_end_time",name="uq_attendance_student_class_session"),db.Index("idx_attendance_class_date_session","class_id","attendance_date","session_start_time","session_end_time"))

class Complaint(db.Model):
    __tablename__="complaints"
    id=db.Column(db.BigInteger,primary_key=True)
    student_id=db.Column(db.BigInteger,db.ForeignKey("students.id"),nullable=False)
    class_id=db.Column(db.BigInteger,db.ForeignKey("classes.id", ondelete="SET NULL"),nullable=True)
    complaint_date=db.Column(db.Date,nullable=False)
    subject=db.Column(db.String(255),nullable=False)
    description=db.Column(db.Text,nullable=False)
    status=db.Column(db.Enum("open","in_progress","resolved"),default="open",nullable=False)
    admin_note=db.Column(db.Text)
    created_at=db.Column(db.DateTime,default=datetime.utcnow)
    updated_at=db.Column(db.DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)


class AuditLog(db.Model):
    __tablename__="audit_logs"; id=db.Column(db.BigInteger,primary_key=True); actor_user_id=db.Column(db.BigInteger,db.ForeignKey("users.id")); action=db.Column(db.String(100),nullable=False); entity_type=db.Column(db.String(100),nullable=False); entity_id=db.Column(db.BigInteger); description=db.Column(db.Text); created_at=db.Column(db.DateTime,default=datetime.utcnow)


class Enquiry(db.Model):
    __tablename__="enquiries"
    id=db.Column(db.BigInteger,primary_key=True)
    name=db.Column(db.String(150),nullable=False)
    phone=db.Column(db.String(30),nullable=False)
    message=db.Column(db.Text,nullable=False)
    status=db.Column(db.Enum("new","read","resolved"),default="new",nullable=False)
    admin_note=db.Column(db.Text)
    created_at=db.Column(db.DateTime,default=datetime.utcnow)
    updated_at=db.Column(db.DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)


class NoticeAttachment(db.Model):
    __tablename__ = "notice_attachments"
    id = db.Column(db.BigInteger, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    mime_type = db.Column(db.String(100), nullable=False)
    file_size = db.Column(db.BigInteger, nullable=False)
    data = db.Column(MEDIUMBLOB, nullable=False)
    uploaded_by = db.Column(db.BigInteger, db.ForeignKey("users.id"), nullable=False)
    target_type = db.Column(db.Enum("all","student","class"), default="all", nullable=False)
    target_student_id = db.Column(db.BigInteger, db.ForeignKey("students.id", ondelete="CASCADE"), nullable=True)
    target_class_id = db.Column(db.BigInteger, db.ForeignKey("classes.id", ondelete="CASCADE"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    __table_args__ = (db.Index("idx_notice_attachments_created", "created_at"),)


class PhotoAsset(db.Model):
    __tablename__ = "photo_assets"
    id = db.Column(db.String(100), primary_key=True)
    mime_type = db.Column(db.String(50), nullable=False)
    data = db.Column(MEDIUMBLOB, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Test(db.Model):
    __tablename__="tests"
    id=db.Column(db.BigInteger,primary_key=True)
    title=db.Column(db.String(255),nullable=False)
    class_id=db.Column(db.BigInteger,db.ForeignKey("classes.id"),nullable=False)
    subject_id=db.Column(db.BigInteger,db.ForeignKey("subjects.id"),nullable=False)
    teacher_id=db.Column(db.BigInteger,db.ForeignKey("teachers.id"),nullable=False)
    duration_minutes=db.Column(db.Integer,nullable=False,default=30)
    total_marks=db.Column(db.Numeric(10,2),nullable=False,default=0)
    status=db.Column(db.Enum("draft","published","closed"),nullable=False,default="draft")
    starts_at=db.Column(db.DateTime,nullable=True)
    ends_at=db.Column(db.DateTime,nullable=True)
    created_at=db.Column(db.DateTime,default=datetime.utcnow)
    updated_at=db.Column(db.DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)
    __table_args__=(db.Index("idx_tests_class_status","class_id","status"),db.Index("idx_tests_teacher_created","teacher_id","created_at"))

class TestQuestion(db.Model):
    __tablename__="test_questions"
    id=db.Column(db.BigInteger,primary_key=True)
    test_id=db.Column(db.BigInteger,db.ForeignKey("tests.id",ondelete="CASCADE"),nullable=False)
    question_text=db.Column(db.Text,nullable=False)
    question_type=db.Column(db.Enum("mcq","true_false","short_answer","numerical","multiple_choice"),nullable=False)
    marks=db.Column(db.Numeric(8,2),nullable=False,default=1)
    options_json=db.Column(db.Text,nullable=True)
    answer_json=db.Column(db.Text,nullable=True)
    explanation=db.Column(db.Text,nullable=True)
    position=db.Column(db.Integer,nullable=False,default=0)
    __table_args__=(db.Index("idx_test_questions_test_position","test_id","position"),)

class TestAttempt(db.Model):
    __tablename__="test_attempts"
    id=db.Column(db.BigInteger,primary_key=True)
    test_id=db.Column(db.BigInteger,db.ForeignKey("tests.id",ondelete="CASCADE"),nullable=False)
    student_id=db.Column(db.BigInteger,db.ForeignKey("students.id",ondelete="CASCADE"),nullable=False)
    started_at=db.Column(db.DateTime,default=datetime.utcnow,nullable=False)
    submitted_at=db.Column(db.DateTime,nullable=True)
    time_taken_seconds=db.Column(db.Integer,nullable=True)
    score=db.Column(db.Numeric(10,2),nullable=True)
    percentage=db.Column(db.Numeric(6,2),nullable=True)
    correct_answers=db.Column(db.Integer,default=0,nullable=False)
    wrong_answers=db.Column(db.Integer,default=0,nullable=False)
    status=db.Column(db.Enum("in_progress","submitted","expired"),nullable=False,default="in_progress")
    answers_json=db.Column(db.Text,nullable=True)
    __table_args__=(db.UniqueConstraint("test_id","student_id",name="uq_test_attempt_student"),db.Index("idx_test_attempt_student_status","student_id","status"),)

class StudyMaterial(db.Model):
    __tablename__="study_materials"
    id=db.Column(db.BigInteger,primary_key=True)
    title=db.Column(db.String(255),nullable=False)
    class_id=db.Column(db.BigInteger,db.ForeignKey("classes.id"),nullable=True)
    subject_id=db.Column(db.BigInteger,db.ForeignKey("subjects.id"),nullable=False)
    chapter=db.Column(db.String(150),nullable=True)
    material_type=db.Column(db.Enum("pdf","notes","image","question_paper","syllabus","previous_year","important_questions","reference"),nullable=False)
    file_url=db.Column(db.String(1000),nullable=False)
    original_filename=db.Column(db.String(255),nullable=False)
    file_size=db.Column(db.BigInteger,nullable=False,default=0)
    uploaded_by=db.Column(db.BigInteger,db.ForeignKey("users.id"),nullable=False)
    created_at=db.Column(db.DateTime,default=datetime.utcnow,nullable=False)
    __table_args__=(db.Index("idx_material_subject_chapter_type","subject_id","chapter","material_type"),db.Index("idx_material_class_created","class_id","created_at"))

class FeeAdjustment(db.Model):
    __tablename__="fee_adjustments"
    id=db.Column(db.BigInteger,primary_key=True)
    student_id=db.Column(db.BigInteger,db.ForeignKey("students.id",ondelete="CASCADE"),nullable=False)
    fee_month=db.Column(db.Date,nullable=False)
    kind=db.Column(db.Enum("discount","scholarship","installment","custom_fee","admission_fee","exam_fee","registration_fee","material_fee","refund","advance","carry_forward","fine"),nullable=False)
    amount=db.Column(db.Numeric(10,2),nullable=False)
    note=db.Column(db.String(500),nullable=True)
    created_by=db.Column(db.BigInteger,db.ForeignKey("users.id"),nullable=False)
    created_at=db.Column(db.DateTime,default=datetime.utcnow,nullable=False)
    __table_args__=(db.Index("idx_fee_adjustments_student_month","student_id","fee_month"),)

class NoticeRead(db.Model):
    __tablename__="notice_reads"
    id=db.Column(db.BigInteger,primary_key=True)
    notice_id=db.Column(db.BigInteger,nullable=False)
    user_id=db.Column(db.BigInteger,db.ForeignKey("users.id",ondelete="CASCADE"),nullable=False)
    read_at=db.Column(db.DateTime,default=datetime.utcnow,nullable=False)
    __table_args__=(db.UniqueConstraint("notice_id","user_id",name="uq_notice_read_user"),)


class LoginHistory(db.Model):
    __tablename__="login_history"
    id=db.Column(db.BigInteger,primary_key=True)
    user_id=db.Column(db.BigInteger,db.ForeignKey("users.id",ondelete="CASCADE"),nullable=False)
    ip_address=db.Column(db.String(64),nullable=True)
    user_agent=db.Column(db.String(500),nullable=True)
    success=db.Column(db.Boolean,nullable=False,default=True)
    created_at=db.Column(db.DateTime,default=datetime.utcnow,nullable=False)
    __table_args__=(db.Index("idx_login_history_user_created","user_id","created_at"),db.Index("idx_login_history_success_created","success","created_at"))

class Notice(db.Model):
    __tablename__="notices"
    id=db.Column(db.BigInteger,primary_key=True)
    title=db.Column(db.String(255),nullable=False)
    body=db.Column(db.Text,nullable=False)
    notice_type=db.Column(db.Enum("holiday","exam","fee","schedule","important","general"),nullable=False,default="general")
    target_type=db.Column(db.Enum("all","course","class","student","teachers"),nullable=False,default="all")
    target_id=db.Column(db.BigInteger,nullable=True)
    priority=db.Column(db.Enum("low","normal","high","urgent"),nullable=False,default="normal")
    attachment_url=db.Column(db.String(1000),nullable=True)
    expires_at=db.Column(db.DateTime,nullable=True)
    created_by=db.Column(db.BigInteger,db.ForeignKey("users.id"),nullable=False)
    created_at=db.Column(db.DateTime,default=datetime.utcnow,nullable=False)
    __table_args__=(db.Index("idx_notices_target_expiry","target_type","target_id","expires_at"),db.Index("idx_notices_created","created_at"),)
