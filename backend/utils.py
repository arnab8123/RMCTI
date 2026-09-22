from datetime import date,datetime,time,timedelta,timezone
from zoneinfo import ZoneInfo
from decimal import Decimal
from flask import jsonify
from .database import db
from .models import AuditLog,FeeStructure,StudentClass,TeacherClass,Class,Subject
import bcrypt,secrets
DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
IST=ZoneInfo("Asia/Kolkata")

def now_ist():
    return datetime.now(IST)

def today_ist():
    return now_ist().date()

def iso_ist(dt):
    """Serialize database timestamps as explicit IST timestamps. DB values are stored as UTC-naive."""
    if not dt:
        return None
    value=dt
    if value.tzinfo is None:
        value=value.replace(tzinfo=timezone.utc)
    return value.astimezone(IST).isoformat()
def ok(data=None,message="",status=200):
    x={"success":True,"message":message}
    if data is not None:x["data"]=data
    return jsonify(x),status
def err(message,status=400): return jsonify(success=False,message=message),status
def validate_password(p):
    value=str(p or "")
    if len(value)<8:
        raise ValueError("Password must be at least 8 characters")
    return value

def hp(p): return bcrypt.hashpw(validate_password(p).encode(),bcrypt.gensalt()).decode()
def cp(p,h): return bcrypt.checkpw(p.encode(),h.encode())
def pd(v,req=False):
    if not v:
        if req: raise ValueError("Date is required")
        return None
    return date.fromisoformat(v)
def pt(v,req=False):
    if not v:
        if req: raise ValueError("Time is required")
        return None
    return time.fromisoformat(v)
def money(v):
    n=Decimal(str(v))
    if n<=0: raise ValueError("Amount must be greater than zero")
    return n.quantize(Decimal("0.01"))
def temp_pw(n=10):
    return "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789") for _ in range(n))
def audit(uid,action,etype,eid=None,desc=None):
    db.session.add(AuditLog(actor_user_id=uid,action=action,entity_type=etype,entity_id=eid,description=desc))
def teacher_has(tid,cid): return TeacherClass.query.filter_by(teacher_id=tid,class_id=cid,status="active").first() is not None
def class_fee_structure(class_id,month=None,active_only=True):
    """Return the latest fee structure that is applicable to the given month."""
    m=(month or today_ist()).replace(day=1)
    q=FeeStructure.query.filter_by(class_id=class_id)
    if active_only:
        q=q.filter(FeeStructure.status=="active")
    rows=q.filter(FeeStructure.effective_from<=m)\
        .filter((FeeStructure.effective_to.is_(None))|(FeeStructure.effective_to>=m))\
        .order_by(FeeStructure.effective_from.desc(),FeeStructure.id.desc()).all()
    return rows[0] if rows else None

def latest_fee_structure(class_id,active_only=True):
    q=FeeStructure.query.filter_by(class_id=class_id)
    if active_only:
        q=q.filter(FeeStructure.status=="active")
    return q.order_by(FeeStructure.effective_from.desc(),FeeStructure.id.desc()).first()

def applicable_fee(student_id,month):
    m=month.replace(day=1)
    rows=(FeeStructure.query
          .join(StudentClass,StudentClass.class_id==FeeStructure.class_id)
          .filter(StudentClass.student_id==student_id,StudentClass.status=="active",FeeStructure.status=="active",FeeStructure.effective_from<=m)
          .filter((FeeStructure.effective_to.is_(None))|(FeeStructure.effective_to>=m))
          .order_by(FeeStructure.class_id.asc(),FeeStructure.effective_from.desc(),FeeStructure.id.desc())
          .all())
    # Use the newest applicable structure for each class, then add fees across all classes.
    per_class={}
    for row in rows:
        per_class.setdefault(row.class_id,row)
    return sum((Decimal(str(x.monthly_fee)) for x in per_class.values()),Decimal("0.00"))
