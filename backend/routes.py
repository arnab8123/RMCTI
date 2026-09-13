from flask import Blueprint,request
from flask_jwt_extended import create_access_token,jwt_required
from sqlalchemy import or_,func
from sqlalchemy.exc import IntegrityError
from datetime import date,datetime,timedelta
import os,uuid
from werkzeug.utils import secure_filename
from .database import db
from .models import *
from .auth import roles,current_user
from .utils import *

api=Blueprint("api",__name__,url_prefix="/api")

def user_profile(u):
    x={"id":u.id,"username":u.username,"role":u.role}
    if u.role=="admin":
        a=Admin.query.filter_by(user_id=u.id).first(); x["name"]=a.name if a else u.username
    elif u.role=="teacher":
        t=Teacher.query.filter_by(user_id=u.id).first(); x.update({"name":t.name,"teacher_id":t.teacher_id} if t else {})
    else:
        s=Student.query.filter_by(user_id=u.id).first(); x.update({"name":s.name,"student_id":s.student_id} if s else {})
    return x

@api.post("/auth/login")
def login():
    b=request.get_json() or {}; u=User.query.filter_by(username=str(b.get("username","")).strip()).first()
    if not u or not u.is_active or not cp(str(b.get("password","")),u.password_hash): return err("Invalid username or password",401)
    return ok({"token":create_access_token(identity=str(u.id),additional_claims={"role":u.role}),"user":user_profile(u)},"Login successful")
@api.post("/auth/logout")
@jwt_required()
def logout(): return ok(message="Logged out successfully")
@api.get("/auth/me")
@jwt_required()
def me(): return ok(user_profile(current_user()))

@api.post("/uploads/photo")
@roles("admin")
def upload_photo():
    f=request.files.get("photo")
    if not f or not f.filename:return err("Photo is required")
    allowed={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}
    ext=allowed.get(f.mimetype)
    if not ext:return err("Only JPG, PNG or WEBP images are allowed")
    f.seek(0,2); size=f.tell(); f.seek(0)
    if size>2*1024*1024:return err("Photo must be 2 MB or smaller")
    name=f"{uuid.uuid4().hex}.{ext}"
    folder=os.path.join(os.path.dirname(__file__),"uploads","photos")
    os.makedirs(folder,exist_ok=True)
    f.save(os.path.join(folder,secure_filename(name)))
    return ok({"photo":f"/uploads/photos/{name}"},"Photo uploaded",201)

def subject_obj(id):
    return Subject.query.get(id)

def class_obj(c):
    s=subject_obj(c.subject_id)
    alloc=[]
    for tc in TeacherClass.query.filter_by(class_id=c.id,status="active").all():
        t=Teacher.query.get(tc.teacher_id)
        alloc.append({"allocation_id":tc.id,"teacher_id":t.teacher_id if t else None,"teacher_name":t.name if t else None,"day":DAYS[tc.day_of_week],"day_of_week":tc.day_of_week,"start_time":tc.start_time.strftime("%H:%M"),"end_time":tc.end_time.strftime("%H:%M"),"room":c.room})
    return {"id":c.id,"class_name":c.class_name,"batch":c.batch,"subject_id":c.subject_id,"subject":s.name if s else "","room":c.room,"max_students":c.max_students,"status":c.status,"student_count":StudentClass.query.filter_by(class_id=c.id,status="active").count(),"allocations":alloc}

def teacher_obj(t):
    cls=[]
    for tc in TeacherClass.query.filter_by(teacher_id=t.id,status="active").all():
        c=Class.query.get(tc.class_id); s=subject_obj(c.subject_id) if c else None
        if c: cls.append({"class_id":c.id,"class_name":c.class_name,"batch":c.batch,"subject":s.name if s else "","day":DAYS[tc.day_of_week],"start_time":tc.start_time.strftime("%H:%M"),"end_time":tc.end_time.strftime("%H:%M"),"room":c.room})
    return {"id":t.id,"teacher_id":t.teacher_id,"name":t.name,"photo":t.photo,"gender":t.gender,"dob":t.dob.isoformat() if t.dob else None,"phone":t.phone,"email":t.email,"address":t.address,"qualification":t.qualification,"experience":t.experience,"joining_date":t.joining_date.isoformat() if t.joining_date else None,"status":t.status,"classes":cls}

def student_obj(s,private=True):
    p=Parent.query.get(s.parent_id) if s.parent_id else None; cls=[]
    for sc in StudentClass.query.filter_by(student_id=s.id,status="active").all():
        c=Class.query.get(sc.class_id); sub=subject_obj(c.subject_id) if c else None
        for tc in TeacherClass.query.filter_by(class_id=sc.class_id,status="active").all():
            t=Teacher.query.get(tc.teacher_id)
            cls.append({"class_id":c.id,"class_name":c.class_name,"batch":c.batch,"subject":sub.name if sub else "","teacher_id":t.teacher_id if t else None,"teacher_name":t.name if t else None,"day":DAYS[tc.day_of_week],"day_of_week":tc.day_of_week,"start_time":tc.start_time.strftime("%H:%M"),"end_time":tc.end_time.strftime("%H:%M"),"room":c.room})
    x={"id":s.id,"student_id":s.student_id,"name":s.name,"photo":s.photo,"gender":s.gender,"dob":s.dob.isoformat() if s.dob else None,"phone":s.phone,"school_name":s.school_name,"admission_date":s.admission_date.isoformat() if s.admission_date else None,"status":s.status,"classes":cls}
    if private:x["address"]=s.address;x["parent"]={"name":p.name,"relationship":p.relationship,"phone":p.phone,"email":p.email,"address":p.address} if p else None
    return x

def homework_obj(h):
    c=Class.query.get(h.class_id);s=subject_obj(h.subject_id);t=Teacher.query.get(h.teacher_id)
    return {"id":h.id,"class_id":h.class_id,"class_name":c.class_name if c else "","batch":c.batch if c else "","teacher_name":t.name if t else "","subject_id":h.subject_id,"subject":s.name if s else "","homework_date":h.homework_date.isoformat(),"due_date":h.due_date.isoformat(),"title":h.title,"description":h.description}

def classwork_obj(w):
    c=Class.query.get(w.class_id);s=subject_obj(w.subject_id);t=Teacher.query.get(w.teacher_id)
    return {"id":w.id,"class_id":w.class_id,"class_name":c.class_name if c else "","batch":c.batch if c else "","teacher_name":t.name if t else "","subject_id":w.subject_id,"subject":s.name if s else "","work_date":w.work_date.isoformat(),"topic":w.topic,"description":w.description,"notes":w.notes}

@api.get("/subjects")
@roles("admin","teacher","student")
def subjects(): return ok([{"id":s.id,"name":s.name} for s in Subject.query.filter_by(is_active=True).order_by(Subject.name).all()])
@api.post("/subjects")
@roles("admin")
def create_subject():
    n=str((request.get_json() or {}).get("name","")).strip()
    if not n:return err("Subject name is required")
    if Subject.query.filter(func.lower(Subject.name)==n.lower()).first():return err("Subject already exists",409)
    s=Subject(name=n);db.session.add(s);audit(current_user().id,"create","subject",None,n);db.session.commit();return ok({"id":s.id,"name":s.name},"Subject created",201)

@api.get("/admin/dashboard")
@roles("admin")
def admin_dashboard():
    m=date.today().replace(day=1); due=0
    for s in Student.query.filter_by(status="active").all():
        if applicable_fee(s.id,m)>0 and not FeePayment.query.filter_by(student_id=s.id,fee_month=m).first():due+=1
    pays=FeePayment.query.order_by(FeePayment.payment_date.desc()).limit(8).all()
    return ok({"total_students":Student.query.filter_by(status="active").count(),"total_teachers":Teacher.query.filter_by(status="active").count(),"total_classes":Class.query.filter_by(status="active").count(),"fees_due":due,"recent_payments":[{"receipt_number":p.receipt_number,"student_name":Student.query.get(p.student_id).name,"month":p.fee_month.strftime("%B %Y"),"amount":float(p.amount)} for p in pays]})

@api.get("/teachers")
@roles("admin")
def teachers():
    q=request.args.get("q","").strip();st=request.args.get("status")
    query=Teacher.query
    if q: query=query.filter(or_(Teacher.teacher_id.like(f"%{q}%"),Teacher.name.like(f"%{q}%"),Teacher.phone.like(f"%{q}%"),Teacher.email.like(f"%{q}%")))
    if st in ("active","inactive"):query=query.filter_by(status=st)
    return ok([teacher_obj(t) for t in query.order_by(Teacher.name).all()])
@api.get("/teachers/<int:id>")
@roles("admin")
def teacher(id):
    t=Teacher.query.get(id);return ok(teacher_obj(t)) if t else err("Teacher not found",404)
@api.post("/teachers")
@roles("admin")
def add_teacher():
    b=request.get_json() or {}; name=str(b.get("name","")).strip()
    if not name:return err("Full name is required")
    pw=str(b.get("password","")).strip() or temp_pw(); tid=f"TCH-{(Teacher.query.count()+1):05d}"; username=str(b.get("username","")).strip() or tid
    if User.query.filter_by(username=username).first():return err("Username already exists",409)
    try:
        u=User(username=username,password_hash=hp(pw),role="teacher");db.session.add(u);db.session.flush()
        t=Teacher(user_id=u.id,teacher_id=tid,name=name,photo=b.get("photo"),gender=b.get("gender"),dob=pd(b.get("dob")),phone=b.get("phone"),email=b.get("email"),address=b.get("address"),qualification=b.get("qualification"),experience=b.get("experience"),joining_date=pd(b.get("joining_date")));db.session.add(t);db.session.flush();audit(current_user().id,"register","teacher",t.id,tid);db.session.commit()
        return ok({"teacher":teacher_obj(t),"credentials":{"username":username,"temporary_password":pw}},"Teacher registered successfully",201)
    except Exception:db.session.rollback();return err("Could not register teacher")
@api.put("/teachers/<int:id>")
@roles("admin")
def edit_teacher(id):
    t=Teacher.query.get(id)
    if not t:return err("Teacher not found",404)
    b=request.get_json() or {}
    for k in ("name","photo","gender","phone","email","address","qualification","experience","status"):
        if k in b:setattr(t,k,b[k])
    if "dob" in b:t.dob=pd(b["dob"])
    if "joining_date" in b:t.joining_date=pd(b["joining_date"])
    audit(current_user().id,"update","teacher",t.id,t.teacher_id);db.session.commit();return ok(teacher_obj(t),"Teacher updated")
@api.delete("/teachers/<int:id>")
@roles("admin")
def remove_teacher(id):
    t=Teacher.query.get(id)
    if not t:return err("Teacher not found",404)
    t.status="inactive";u=User.query.get(t.user_id);u.is_active=False
    for x in TeacherClass.query.filter_by(teacher_id=t.id).all():x.status="inactive"
    audit(current_user().id,"unregister","teacher",t.id,t.teacher_id);db.session.commit();return ok(message="Teacher unregistered successfully")

@api.get("/classes")
@roles("admin","teacher","student")
def classes():
    st=request.args.get("status");q=request.args.get("q","").strip();query=Class.query
    if st in ("active","inactive"):query=query.filter_by(status=st)
    if q:query=query.filter(or_(Class.class_name.like(f"%{q}%"),Class.batch.like(f"%{q}%")))
    return ok([class_obj(c) for c in query.order_by(Class.class_name,Class.batch).all()])
@api.post("/classes")
@roles("admin")
def add_class():
    b=request.get_json() or {}
    try:c=Class(class_name=str(b["class_name"]).strip(),batch=str(b["batch"]).strip(),subject_id=int(b["subject_id"]),room=b.get("room"),max_students=int(b.get("max_students",30)));db.session.add(c);db.session.flush();audit(current_user().id,"create","class",c.id,c.class_name);db.session.commit();return ok(class_obj(c),"Class created",201)
    except Exception:db.session.rollback();return err("Invalid class data")
@api.put("/classes/<int:id>")
@roles("admin")
def edit_class(id):
    c=Class.query.get(id)
    if not c:return err("Class not found",404)
    b=request.get_json() or {}
    for k in ("class_name","batch","room","status"): 
        if k in b:setattr(c,k,b[k])
    for k in ("subject_id","max_students"):
        if k in b:setattr(c,k,int(b[k]))
    db.session.commit();return ok(class_obj(c),"Class updated")
@api.delete("/classes/<int:id>")
@roles("admin")
def deactivate_class(id):
    c=Class.query.get(id)
    if not c:return err("Class not found",404)
    c.status="inactive"
    for x in TeacherClass.query.filter_by(class_id=id).all():x.status="inactive"
    for x in StudentClass.query.filter_by(class_id=id).all():x.status="inactive"
    db.session.commit();return ok(message="Class deactivated")

@api.post("/teacher-classes")
@roles("admin")
def add_allocation():
    b=request.get_json() or {}
    try:
        tid=int(b["teacher_id"]);cid=int(b["class_id"]);day=int(b["day_of_week"]);start=pt(b["start_time"],True);end=pt(b["end_time"],True)
        if start>=end:return err("End time must be after start time")
        if TeacherClass.query.filter(TeacherClass.teacher_id==tid,TeacherClass.day_of_week==day,TeacherClass.status=="active",TeacherClass.start_time<end,TeacherClass.end_time>start).first():return err("Teacher schedule overlaps",409)
        tc=TeacherClass(teacher_id=tid,class_id=cid,day_of_week=day,start_time=start,end_time=end);db.session.add(tc);db.session.commit();return ok(class_obj(Class.query.get(cid)),"Class assigned",201)
    except Exception:db.session.rollback();return err("Invalid class allocation")
@api.put("/teacher-classes/<int:id>")
@roles("admin")
def edit_allocation(id):
    x=TeacherClass.query.get(id)
    if not x:return err("Allocation not found",404)
    b=request.get_json() or {}
    try:
        tid=int(b.get("teacher_id",x.teacher_id));cid=int(b.get("class_id",x.class_id));day=int(b.get("day_of_week",x.day_of_week));start=pt(b.get("start_time",x.start_time),True);end=pt(b.get("end_time",x.end_time),True)
        if start>=end:return err("End time must be after start time")
        overlap=TeacherClass.query.filter(TeacherClass.id!=id,TeacherClass.teacher_id==tid,TeacherClass.day_of_week==day,TeacherClass.status=="active",TeacherClass.start_time<end,TeacherClass.end_time>start).first()
        if overlap:return err("Teacher schedule overlaps",409)
        x.teacher_id=tid;x.class_id=cid;x.day_of_week=day;x.start_time=start;x.end_time=end
        db.session.commit();return ok(class_obj(Class.query.get(cid)),"Class allocation updated")
    except Exception:
        db.session.rollback();return err("Invalid class allocation")
@api.delete("/teacher-classes/<int:id>")
@roles("admin")
def remove_allocation(id):
    x=TeacherClass.query.get(id)
    if not x:return err("Allocation not found",404)
    x.status="inactive";db.session.commit();return ok(message="Allocation deactivated")

@api.post("/student-classes")
@roles("admin")
def add_student_class():
    b=request.get_json() or {};sid=int(b.get("student_id"));cid=int(b.get("class_id"));c=Class.query.get(cid)
    if not Student.query.get(sid) or not c:return err("Student or class not found",404)
    if StudentClass.query.filter_by(student_id=sid,class_id=cid,status="active").first():return err("Student is already assigned",409)
    if StudentClass.query.filter_by(class_id=cid,status="active").count()>=c.max_students:return err("Class capacity reached",409)
    db.session.add(StudentClass(student_id=sid,class_id=cid));db.session.commit();return ok(message="Student assigned to class")

@api.get("/students")
@roles("admin")
def students():
    q=request.args.get("q","").strip();st=request.args.get("status");query=Student.query
    if q:
        ids=[p.id for p in Parent.query.filter(or_(Parent.name.like(f"%{q}%"),Parent.phone.like(f"%{q}%"))).all()]
        query=query.filter(or_(Student.student_id.like(f"%{q}%"),Student.name.like(f"%{q}%"),Student.phone.like(f"%{q}%"),Student.parent_id.in_(ids or [-1])))
    if st in ("active","inactive"):query=query.filter_by(status=st)
    return ok([student_obj(s) for s in query.order_by(Student.name).all()])
@api.get("/students/<int:id>")
@roles("admin")
def student(id):
    s=Student.query.get(id);return ok(student_obj(s)) if s else err("Student not found",404)
@api.post("/students")
@roles("admin")
def add_student():
    b=request.get_json() or {};name=str(b.get("name","")).strip()
    if not name:return err("Full name is required")
    pw=str(b.get("password","")).strip() or temp_pw();sid=f"STD-{(Student.query.count()+1):05d}";username=str(b.get("username","")).strip() or sid
    if User.query.filter_by(username=username).first():return err("Username already exists",409)
    try:
        u=User(username=username,password_hash=hp(pw),role="student");db.session.add(u);db.session.flush()
        pdat=b.get("parent") or {};p=None
        if str(pdat.get("name","")).strip():p=Parent(name=pdat["name"],relationship=pdat.get("relationship"),phone=pdat.get("phone"),email=pdat.get("email"),address=pdat.get("address"));db.session.add(p);db.session.flush()
        s=Student(user_id=u.id,student_id=sid,name=name,photo=b.get("photo"),gender=b.get("gender"),dob=pd(b.get("dob")),phone=b.get("phone"),address=b.get("address"),school_name=b.get("school_name"),admission_date=pd(b.get("admission_date")),parent_id=p.id if p else None);db.session.add(s);db.session.flush()
        for cid in b.get("class_ids",[]): 
            c=Class.query.get(int(cid))
            if c:db.session.add(StudentClass(student_id=s.id,class_id=c.id))
        audit(current_user().id,"register","student",s.id,sid);db.session.commit();return ok({"student":student_obj(s),"credentials":{"username":username,"temporary_password":pw}},"Student registered successfully",201)
    except Exception:db.session.rollback();return err("Could not register student")
@api.put("/students/<int:id>")
@roles("admin")
def edit_student(id):
    s=Student.query.get(id)
    if not s:return err("Student not found",404)
    b=request.get_json() or {}
    for k in ("name","photo","gender","phone","address","school_name","status"):
        if k in b:setattr(s,k,b[k])
    if "dob" in b:s.dob=pd(b["dob"])
    if "admission_date" in b:s.admission_date=pd(b["admission_date"])
    if "parent" in b and s.parent_id:
        p=Parent.query.get(s.parent_id);pdat=b["parent"]
        for k in ("name","relationship","phone","email","address"):
            if k in pdat:setattr(p,k,pdat[k])
    db.session.commit();return ok(student_obj(s),"Student updated")
@api.delete("/students/<int:id>")
@roles("admin")
def remove_student(id):
    s=Student.query.get(id)
    if not s:return err("Student not found",404)
    s.status="inactive";u=User.query.get(s.user_id);u.is_active=False
    for x in StudentClass.query.filter_by(student_id=id).all():x.status="inactive"
    db.session.commit();return ok(message="Student unregistered successfully")

@api.get("/fee-structures/<int:id>")
@roles("admin")
def fee_structure(id):
    f=FeeStructure.query.get(id)
    if not f:return err("Fee structure not found",404)
    c=Class.query.get(f.class_id);su=subject_obj(c.subject_id) if c else None
    return ok({"id":f.id,"class_id":f.class_id,"class_name":c.class_name if c else "","batch":c.batch if c else "","subject":su.name if su else "","monthly_fee":float(f.monthly_fee),"effective_from":f.effective_from.isoformat(),"effective_to":f.effective_to.isoformat() if f.effective_to else None,"status":f.status})
@api.get("/fee-structures")
@roles("admin")
def fee_structures():
    out=[]
    for f in FeeStructure.query.order_by(FeeStructure.effective_from.desc()).all():
        c=Class.query.get(f.class_id);su=subject_obj(c.subject_id) if c else None
        out.append({"id":f.id,"class_id":f.class_id,"class_name":c.class_name if c else "","batch":c.batch if c else "","subject":su.name if su else "","monthly_fee":float(f.monthly_fee),"effective_from":f.effective_from.isoformat(),"effective_to":f.effective_to.isoformat() if f.effective_to else None,"status":f.status})
    return ok(out)
@api.post("/fee-structures")
@roles("admin")
def add_fee_structure():
    b=request.get_json() or {}
    try:
        f=FeeStructure(class_id=int(b["class_id"]),monthly_fee=money(b["monthly_fee"]),effective_from=pd(b["effective_from"],True),effective_to=pd(b.get("effective_to")),created_by=current_user().id);db.session.add(f);db.session.commit();return ok({"id":f.id},"Fee structure created",201)
    except Exception:db.session.rollback();return err("Invalid fee structure")
@api.put("/fee-structures/<int:id>")
@roles("admin")
def edit_fee_structure(id):
    f=FeeStructure.query.get(id)
    if not f:return err("Fee structure not found",404)
    b=request.get_json() or {}
    try:
        if "class_id" in b:f.class_id=int(b["class_id"])
        if "monthly_fee" in b:f.monthly_fee=money(b["monthly_fee"])
        if "effective_from" in b:f.effective_from=pd(b["effective_from"],True)
        if "effective_to" in b:f.effective_to=pd(b["effective_to"])
        if "status" in b:f.status=b["status"]
        db.session.commit();return ok({"id":f.id},"Fee structure updated")
    except Exception:
        db.session.rollback();return err("Invalid fee structure")
@api.delete("/fee-structures/<int:id>")
@roles("admin")
def remove_fee_structure(id):
    f=FeeStructure.query.get(id)
    if not f:return err("Fee structure not found",404)
    f.status="inactive";db.session.commit();return ok(message="Fee structure deactivated")

def history(sid):
    pay={p.fee_month:p for p in FeePayment.query.filter_by(student_id=sid).all()};m=date.today().replace(day=1);out=[]
    for _ in range(12):
        due=applicable_fee(sid,m);p=pay.get(m);out.append({"month":m.strftime("%Y-%m"),"month_label":m.strftime("%B %Y"),"amount":float(p.amount if p else due),"due_amount":float(due),"status":"PAID" if p else ("DUE" if due else "N/A"),"payment_date":p.payment_date.isoformat() if p else None,"receipt_number":p.receipt_number if p else None});m=(m-timedelta(days=1)).replace(day=1)
    return out

@api.get("/fees")
@roles("admin")
def fees():
    m=date.fromisoformat((request.args.get("month") or date.today().strftime("%Y-%m"))+"-01");q=request.args.get("q","").lower();st=request.args.get("status","").upper();out=[]
    for s in Student.query.filter_by(status="active").all():
        if q not in f"{s.student_id} {s.name} {s.phone or ''}".lower():continue
        due=applicable_fee(s.id,m);p=FeePayment.query.filter_by(student_id=s.id,fee_month=m).first();status="PAID" if p else ("DUE" if due else "N/A")
        if st and st!=status:continue
        out.append({"student_id":s.id,"student_code":s.student_id,"student_name":s.name,"fee_month":m.strftime("%Y-%m"),"amount":float(p.amount if p else due),"status":status,"receipt_number":p.receipt_number if p else None})
    return ok(out)
@api.get("/fees/student/<int:id>")
@roles("admin","student")
def student_fees(id):
    s=Student.query.get(id);u=current_user()
    if not s:return err("Student not found",404)
    if u.role=="student" and s.user_id!=u.id:return err("Unauthorized",403)
    return ok({"student":student_obj(s,private=u.role=="admin"),"current_monthly_fee":float(applicable_fee(s.id,date.today().replace(day=1))),"history":history(s.id)})
@api.post("/fees/payment")
@roles("admin")
def pay_fee():
    b=request.get_json() or {}
    try:
        sid=int(b["student_id"]);m=date.fromisoformat(str(b["month"])+"-01");amount=money(b["amount"]);s=Student.query.get(sid);expected=applicable_fee(sid,m)
        if not s:return err("Student not found",404)
        if FeePayment.query.filter_by(student_id=sid,fee_month=m).first():return err("Fee already paid for this month",409)
        if expected<=0:return err("No fee structure applies to this month")
        if amount!=expected:return err(f"Amount must equal ₹{expected:.2f}")
        rno=f"RCPT-{datetime.utcnow():%Y%m%d%H%M%S}-{__import__('secrets').token_hex(2).upper()}"
        p=FeePayment(student_id=sid,fee_month=m,amount=amount,payment_method=b["payment_method"],collected_by=current_user().id,receipt_number=rno,notes=b.get("notes"));db.session.add(p);db.session.flush();r=Receipt(fee_payment_id=p.id,receipt_number=rno);db.session.add(r);audit(current_user().id,"collect_fee","fee_payment",p.id,rno);db.session.commit();return ok({"id":p.id,"receipt_id":r.id,"receipt_number":rno},"Fee payment recorded",201)
    except IntegrityError:db.session.rollback();return err("Duplicate payment",409)
    except Exception:db.session.rollback();return err("Invalid payment data")

@api.get("/receipts")
@roles("admin")
def receipts():
    q=request.args.get("q","").lower();out=[]
    for r in Receipt.query.order_by(Receipt.generated_at.desc()).all():
        p=FeePayment.query.get(r.fee_payment_id);s=Student.query.get(p.student_id)
        if q and q not in f"{r.receipt_number} {s.student_id} {s.name}".lower():continue
        out.append({"id":r.id,"receipt_number":r.receipt_number,"student_name":s.name,"student_id":s.student_id,"month":p.fee_month.strftime("%B %Y"),"amount":float(p.amount),"method":p.payment_method,"generated_at":r.generated_at.isoformat()})
    return ok(out)
@api.get("/receipts/<int:id>")
@roles("admin")
def receipt(id):
    r=Receipt.query.get(id)
    if not r:return err("Receipt not found",404)
    p=FeePayment.query.get(r.fee_payment_id);s=Student.query.get(p.student_id);a=Admin.query.filter_by(user_id=p.collected_by).first()
    return ok({"receipt_number":r.receipt_number,"student":s.name,"student_id":s.student_id,"class":student_obj(s)["classes"][0]["class_name"] if student_obj(s)["classes"] else "","teacher":student_obj(s)["classes"][0]["teacher_name"] if student_obj(s)["classes"] else "","fee_month":p.fee_month.strftime("%B %Y"),"amount":float(p.amount),"payment_method":p.payment_method,"payment_date":p.payment_date.isoformat(),"collected_by":a.name if a else "Admin"})

def teacher_for_user():
    return Teacher.query.filter_by(user_id=current_user().id).first()
def student_for_user():
    return Student.query.filter_by(user_id=current_user().id).first()

@api.get("/teacher/dashboard")
@roles("teacher")
def teacher_dashboard():
    t=teacher_for_user();alloc=TeacherClass.query.filter_by(teacher_id=t.id,status="active").all();ids={x.student_id for a in alloc for x in StudentClass.query.filter_by(class_id=a.class_id,status="active").all()};today=date.today()
    return ok({"teacher":teacher_obj(t),"total_students":len(ids),"total_classes":len(alloc),"todays_classes":[class_obj(Class.query.get(a.class_id))|{"start_time":a.start_time.strftime("%H:%M"),"end_time":a.end_time.strftime("%H:%M")} for a in alloc if a.day_of_week==today.weekday()],"pending_homework":Homework.query.filter_by(teacher_id=t.id).filter(Homework.due_date>=today).count(),"recent_classwork":[classwork_obj(x) for x in Classwork.query.filter_by(teacher_id=t.id).order_by(Classwork.work_date.desc()).limit(5).all()]})
@api.get("/teacher/students")
@roles("teacher")
def teacher_students():
    t=teacher_for_user();ids={x.student_id for a in TeacherClass.query.filter_by(teacher_id=t.id,status="active").all() for x in StudentClass.query.filter_by(class_id=a.class_id,status="active").all()};q=request.args.get("q","").lower();return ok([student_obj(Student.query.get(i),private=False) for i in ids if Student.query.get(i) and (not q or q in f"{Student.query.get(i).name} {Student.query.get(i).student_id}".lower())])
@api.get("/teacher/classes")
@roles("teacher")
def my_classes():
    t=teacher_for_user();return ok([class_obj(Class.query.get(a.class_id)) for a in TeacherClass.query.filter_by(teacher_id=t.id,status="active").all()])

@api.get("/homework")
@roles("admin","teacher","student")
def get_homework():
    u=current_user();q=Homework.query
    if u.role=="teacher":q=q.filter_by(teacher_id=teacher_for_user().id)
    if u.role=="student":q=q.filter(Homework.class_id.in_([x.class_id for x in StudentClass.query.filter_by(student_id=student_for_user().id,status="active").all()] or [-1]))
    return ok([homework_obj(x) for x in q.order_by(Homework.homework_date.desc()).all()])
@api.post("/homework")
@roles("teacher")
def add_homework():
    t=teacher_for_user();b=request.get_json() or {};cid=int(b["class_id"])
    if not TeacherClass.query.filter_by(teacher_id=t.id,class_id=cid,status="active").first():return err("Unauthorized",403)
    h=Homework(class_id=cid,teacher_id=t.id,subject_id=int(b["subject_id"]),homework_date=pd(b["homework_date"],True),due_date=pd(b["due_date"],True),title=str(b["title"]).strip(),description=str(b["description"]).strip());db.session.add(h);db.session.commit();return ok(homework_obj(h),"Homework added",201)
@api.put("/homework/<int:id>")
@roles("teacher")
def edit_homework(id):
    t=teacher_for_user();h=Homework.query.get(id)
    if not h or h.teacher_id!=t.id:return err("Not found",404)
    b=request.get_json() or {}
    try:
        cid=int(b.get("class_id",h.class_id))
        if not TeacherClass.query.filter_by(teacher_id=t.id,class_id=cid,status="active").first():return err("Unauthorized",403)
        h.class_id=cid;h.subject_id=int(b.get("subject_id",h.subject_id));h.homework_date=pd(b.get("homework_date",h.homework_date),True);h.due_date=pd(b.get("due_date",h.due_date),True);h.title=str(b.get("title",h.title)).strip();h.description=str(b.get("description",h.description)).strip()
        db.session.commit();return ok(homework_obj(h),"Homework updated")
    except Exception:
        db.session.rollback();return err("Invalid homework data")
@api.delete("/homework/<int:id>")
@roles("teacher")
def del_homework(id):
    h=Homework.query.get(id)
    if not h or h.teacher_id!=teacher_for_user().id:return err("Not found",404)
    db.session.delete(h);db.session.commit();return ok(message="Homework deleted")

@api.get("/classwork")
@roles("admin","teacher","student")
def get_classwork():
    u=current_user();q=Classwork.query
    if u.role=="teacher":q=q.filter_by(teacher_id=teacher_for_user().id)
    if u.role=="student":q=q.filter(Classwork.class_id.in_([x.class_id for x in StudentClass.query.filter_by(student_id=student_for_user().id,status="active").all()] or [-1]))
    return ok([classwork_obj(x) for x in q.order_by(Classwork.work_date.desc()).all()])
@api.post("/classwork")
@roles("teacher")
def add_classwork():
    t=teacher_for_user();b=request.get_json() or {};cid=int(b["class_id"])
    if not TeacherClass.query.filter_by(teacher_id=t.id,class_id=cid,status="active").first():return err("Unauthorized",403)
    w=Classwork(class_id=cid,teacher_id=t.id,subject_id=int(b["subject_id"]),work_date=pd(b["work_date"],True),topic=str(b["topic"]).strip(),description=str(b["description"]).strip(),notes=b.get("notes"));db.session.add(w);db.session.commit();return ok(classwork_obj(w),"Classwork added",201)
@api.put("/classwork/<int:id>")
@roles("teacher")
def edit_classwork(id):
    t=teacher_for_user();w=Classwork.query.get(id)
    if not w or w.teacher_id!=t.id:return err("Not found",404)
    b=request.get_json() or {}
    try:
        cid=int(b.get("class_id",w.class_id))
        if not TeacherClass.query.filter_by(teacher_id=t.id,class_id=cid,status="active").first():return err("Unauthorized",403)
        w.class_id=cid;w.subject_id=int(b.get("subject_id",w.subject_id));w.work_date=pd(b.get("work_date",w.work_date),True);w.topic=str(b.get("topic",w.topic)).strip();w.description=str(b.get("description",w.description)).strip();w.notes=b.get("notes",w.notes)
        db.session.commit();return ok(classwork_obj(w),"Classwork updated")
    except Exception:
        db.session.rollback();return err("Invalid classwork data")
@api.delete("/classwork/<int:id>")
@roles("teacher")
def del_classwork(id):
    w=Classwork.query.get(id)
    if not w or w.teacher_id!=teacher_for_user().id:return err("Not found",404)
    db.session.delete(w);db.session.commit();return ok(message="Classwork deleted")

@api.get("/student/dashboard")
@roles("student")
def student_dashboard():
    s=student_for_user();x=student_obj(s,private=False);today=date.today();month=today.replace(day=1);hw=[h for h in get_homework()[0].json["data"][:5]] if False else [homework_obj(h) for h in Homework.query.filter(Homework.class_id.in_([c["class_id"] for c in x["classes"]] or [-1]),Homework.due_date>=today).order_by(Homework.due_date).limit(5).all()]
    paid=FeePayment.query.filter_by(student_id=s.id,fee_month=month).first();fee=applicable_fee(s.id,month)
    return ok({"student":x,"todays_classes":[c for c in x["classes"] if c["day_of_week"]==today.weekday()],"upcoming_homework":hw,"current_fee":{"amount":float(fee),"status":"PAID" if paid else ("DUE" if fee else "N/A")},"next_class":x["classes"][0] if x["classes"] else None})
@api.get("/student/routine")
@roles("student")
def student_routine():return ok(student_obj(student_for_user(),private=False)["classes"])
@api.get("/student/homework")
@roles("student")
def student_homework():return get_homework()
@api.get("/student/classwork")
@roles("student")
def student_classwork():return get_classwork()
@api.get("/student/teacher")
@roles("student")
def student_teacher():
    s=student_for_user();seen=set();out=[]
    for c in student_obj(s,False)["classes"]:
        tid=c["teacher_id"]
        if tid and tid not in seen:
            t=Teacher.query.filter_by(teacher_id=tid).first();out.append({"teacher_id":t.teacher_id,"name":t.name,"photo":t.photo,"subject":c["subject"],"qualification":t.qualification,"phone":t.phone,"email":t.email,"class_name":c["class_name"],"batch":c["batch"]});seen.add(tid)
    return ok(out)

@api.get("/audit-logs")
@roles("admin")
def audits():return ok([{"id":x.id,"action":x.action,"entity_type":x.entity_type,"entity_id":x.entity_id,"description":x.description,"created_at":x.created_at.isoformat()} for x in AuditLog.query.order_by(AuditLog.created_at.desc()).limit(200).all()])
