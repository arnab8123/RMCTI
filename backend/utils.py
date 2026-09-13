from datetime import date,datetime,time
from decimal import Decimal
from flask import jsonify
from .database import db
from .models import AuditLog,FeeStructure,StudentClass,TeacherClass,Class,Subject
import bcrypt,secrets
DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
def ok(data=None,message="",status=200):
    x={"success":True,"message":message}
    if data is not None:x["data"]=data
    return jsonify(x),status
def err(message,status=400): return jsonify(success=False,message=message),status
def hp(p): return bcrypt.hashpw(p.encode(),bcrypt.gensalt()).decode()
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
def applicable_fee(student_id,month):
    m=month.replace(day=1)
    rows=FeeStructure.query.join(StudentClass,StudentClass.class_id==FeeStructure.class_id).filter(StudentClass.student_id==student_id,StudentClass.status=="active",FeeStructure.status=="active",FeeStructure.effective_from<=m).filter((FeeStructure.effective_to.is_(None))|(FeeStructure.effective_to>=m)).all()
    return sum((Decimal(str(x.monthly_fee)) for x in rows),Decimal("0.00"))
