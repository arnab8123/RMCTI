from flask import Blueprint,request
from flask_jwt_extended import create_access_token,jwt_required
from sqlalchemy import or_,func
from sqlalchemy.exc import IntegrityError
from datetime import date,datetime,timedelta,time
from decimal import Decimal
from zoneinfo import ZoneInfo
import os,uuid
from werkzeug.utils import secure_filename
from flask import Response
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

def _enquiry_row(e):
    return {
        "id": e.id,
        "name": e.name,
        "phone": e.phone,
        "message": e.message,
        "status": e.status,
        "admin_note": e.admin_note,
        "created_at": iso_ist(e.created_at),
        "updated_at": iso_ist(e.updated_at),
    }


def _save_enquiry():
    b = request.get_json(silent=True) or {}
    name = str(b.get("name", "")).strip()
    phone = str(b.get("phone", "")).strip()
    message = str(b.get("message", "")).strip()

    if not name:
        return err("Name is required")
    if not phone:
        return err("Phone number is required")
    if not message:
        return err("Message is required")
    if len(name) > 150 or len(phone) > 30 or len(message) > 5000:
        return err("Please keep the enquiry within the allowed length")

    e = Enquiry(name=name, phone=phone, message=message, status="new")
    try:
        db.session.add(e)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return ok(_enquiry_row(e), "Enquiry submitted successfully", 201)


# Public endpoint used by the landing-page Contact form.
# Keep /enquiries as a compatibility alias for older deployed frontends.
@api.post("/public/enquiries")
def create_public_enquiry():
    return _save_enquiry()


@api.post("/enquiries")
def create_enquiry_legacy():
    return _save_enquiry()


def _list_enquiries():
    status = request.args.get("status", "").strip()
    q = request.args.get("q", "").strip().lower()
    query = Enquiry.query
    if status in ("new", "read", "resolved"):
        query = query.filter_by(status=status)

    out = []
    for e in query.order_by(Enquiry.created_at.desc(), Enquiry.id.desc()).all():
        if q and q not in f"{e.name} {e.phone} {e.message}".lower():
            continue
        out.append(_enquiry_row(e))
    return ok(out)


# Admin-only endpoint. This is the canonical endpoint used by the admin UI.
@api.get("/admin/enquiries")
@roles("admin")
def admin_enquiries():
    return _list_enquiries()


# Compatibility alias for older admin pages.
@api.get("/enquiries")
@roles("admin")
def enquiries():
    return _list_enquiries()


def _update_enquiry(id):
    e = Enquiry.query.get(id)
    if not e:
        return err("Enquiry not found", 404)

    b = request.get_json(silent=True) or {}
    status = b.get("status")
    if status is not None:
        if status not in ("new", "read", "resolved"):
            return err("Invalid enquiry status")
        e.status = status
    if "admin_note" in b:
        e.admin_note = str(b.get("admin_note") or "").strip() or None

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return ok(_enquiry_row(e), "Enquiry updated")


@api.put("/admin/enquiries/<int:id>")
@roles("admin")
def update_admin_enquiry(id):
    return _update_enquiry(id)


@api.put("/enquiries/<int:id>")
@roles("admin")
def update_enquiry(id):
    return _update_enquiry(id)

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

@api.get("/notifications")
@roles("admin","teacher","student")
def notifications():
    u=current_user();out={"role":u.role}
    if u.role=="admin":
        month=today_ist().replace(day=1)
        active_students=Student.query.filter_by(status="active").all()
        student_ids=[s.id for s in active_students]
        fee_rows=(FeeStructure.query.join(StudentClass,StudentClass.class_id==FeeStructure.class_id)
            .filter(StudentClass.student_id.in_(student_ids or [-1]),StudentClass.status=="active",FeeStructure.status=="active",FeeStructure.effective_from<=month)
            .filter((FeeStructure.effective_to.is_(None))|(FeeStructure.effective_to>=month))
            .order_by(FeeStructure.class_id.asc(),FeeStructure.effective_from.desc(),FeeStructure.id.desc()).all())
        latest_by_class={}
        for row in fee_rows: latest_by_class.setdefault(row.class_id,row)
        class_ids_by_student={sid:set() for sid in student_ids}
        for sc in StudentClass.query.filter(StudentClass.student_id.in_(student_ids or [-1]),StudentClass.status=="active").all(): class_ids_by_student[sc.student_id].add(sc.class_id)
        paid_ids={p.student_id for p in FeePayment.query.filter(FeePayment.student_id.in_(student_ids or [-1]),FeePayment.fee_month==month).all()}
        due_ids=[str(sid) for sid in student_ids if sid not in paid_ids and any(cid in latest_by_class for cid in class_ids_by_student[sid])]
        due_ids.sort()
        latest_complaint=Complaint.query.order_by(Complaint.created_at.desc(),Complaint.id.desc()).first()
        out["complaints"]={"latest":iso_ist(latest_complaint.created_at) if latest_complaint else None,"count":Complaint.query.filter(Complaint.status!="resolved").count()}
        out["fees"]={"count":len(due_ids),"signature":f"{month.isoformat()}:{','.join(due_ids)}"}
        try:
            latest_enquiry=Enquiry.query.order_by(Enquiry.created_at.desc(),Enquiry.id.desc()).first()
            out["enquiries"]={"latest":iso_ist(latest_enquiry.created_at) if latest_enquiry else None,"count":Enquiry.query.filter_by(status="new").count()}
        except Exception:
            db.session.rollback();out["enquiries"]={"latest":None,"count":0}
    elif u.role=="student":
        s=Student.query.filter_by(user_id=u.id).first()
        class_ids=[x.class_id for x in StudentClass.query.filter_by(student_id=s.id,status="active").all()] if s else []
        latest_hw=Homework.query.filter(Homework.class_id.in_(class_ids or [-1])).order_by(Homework.created_at.desc(),Homework.id.desc()).first()
        latest_complaint=None
        if s:
            for complaint in Complaint.query.filter_by(student_id=s.id).order_by(Complaint.updated_at.desc(),Complaint.id.desc()).all():
                if complaint.status!="open" or (complaint.updated_at and complaint.created_at and complaint.updated_at>complaint.created_at):
                    latest_complaint=complaint;break
        out["homework"]={"latest":iso_ist(latest_hw.created_at) if latest_hw and latest_hw.created_at else None}
        out["complaints"]={"latest":iso_ist(latest_complaint.updated_at) if latest_complaint and latest_complaint.updated_at else None}
    return ok(out)

@api.post("/uploads/photo")
@roles("admin")
def upload_photo():
    f=request.files.get("photo")
    if not f or not f.filename:return err("Photo is required")
    allowed={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}
    ext=allowed.get((f.mimetype or "").lower())
    if not ext:return err("Only JPG, PNG or WEBP images are allowed")
    f.seek(0,2); size=f.tell(); f.seek(0)
    if size>2*1024*1024:return err("Photo must be 2 MB or smaller")
    data=f.read()
    name=f"{uuid.uuid4().hex}.{ext}"

    # Production storage: Cloudinary serves the image directly to the browser
    # through its CDN. This avoids sending image bytes through Render and avoids
    # storing large BLOBs in the remote Aiven MySQL database.
    if os.getenv("PHOTO_STORAGE", "cloudinary").strip().lower() == "cloudinary":
        try:
            import cloudinary
            import cloudinary.uploader
            cloudinary_url = os.getenv("CLOUDINARY_URL", "").strip()
            if not cloudinary_url:
                raise RuntimeError("CLOUDINARY_URL is missing")
            if not cloudinary_url.startswith("cloudinary://"):
                raise RuntimeError("CLOUDINARY_URL has an invalid format")
            # Configure explicitly instead of relying on SDK auto-discovery.
            # This is important on Render where environment variables are
            # injected into the running process rather than a local .env file.
            cloudinary.config(cloudinary_url=cloudinary_url, secure=True)
            result=cloudinary.uploader.upload(
                data,
                folder=os.getenv("CLOUDINARY_FOLDER", "rmcti/photos"),
                public_id=os.path.splitext(name)[0],
                resource_type="image",
                overwrite=False,
                transformation=[{
                    "width": 600, "height": 800, "crop": "fill",
                    "gravity": "auto", "quality": "auto", "fetch_format": "auto"
                }]
            )
            return ok({"photo":result["secure_url"]},"Photo uploaded",201)
        except Exception as exc:
            db.session.rollback()
            # Do not silently fall back to MySQL in production: doing so would
            # reintroduce the exact performance problem this endpoint avoids.
            current_app=__import__('flask').current_app
            current_app.logger.exception("Cloudinary upload failed: %s", exc)
            if os.getenv("FLASK_ENV", "production").lower() == "production":
                return err("Photo storage is not configured or the Cloudinary upload failed. Check CLOUDINARY_URL in Render logs.",500)
            return err("Could not upload photo. Please check Cloudinary configuration.",500)

    # Local-development fallback. Set PHOTO_STORAGE=mysql only if Cloudinary
    # is intentionally unavailable for a local test.
    asset=PhotoAsset(id=name,mime_type=f.mimetype or "application/octet-stream",data=data)
    try:
        db.session.add(asset)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return err("Could not save photo. Please try again.",500)
    return ok({"photo":f"/uploads/photos/{name}"},"Photo uploaded",201)

def subject_obj(id):
    return Subject.query.get(id)


def _student_classes_bulk(student_ids):
    """Load all student->class->teacher data for a collection in a few queries."""
    if not student_ids:
        return {}
    sc_rows=StudentClass.query.filter(StudentClass.student_id.in_(student_ids),StudentClass.status=="active").all()
    class_ids={x.class_id for x in sc_rows}
    classes={c.id:c for c in Class.query.filter(Class.id.in_(class_ids)).all()} if class_ids else {}
    subject_ids={c.subject_id for c in classes.values()}
    subjects={x.id:x for x in Subject.query.filter(Subject.id.in_(subject_ids)).all()} if subject_ids else {}
    tc_rows=TeacherClass.query.filter(TeacherClass.class_id.in_(class_ids),TeacherClass.status=="active").all() if class_ids else []
    teacher_ids={x.teacher_id for x in tc_rows}
    teachers={x.id:x for x in Teacher.query.filter(Teacher.id.in_(teacher_ids)).all()} if teacher_ids else {}
    tc_by_class={}
    for tc in tc_rows: tc_by_class.setdefault(tc.class_id,[]).append(tc)
    out={sid:[] for sid in student_ids}
    for sc in sc_rows:
        c=classes.get(sc.class_id)
        if not c: continue
        sub=subjects.get(c.subject_id)
        for tc in tc_by_class.get(sc.class_id,[]):
            t=teachers.get(tc.teacher_id)
            out[sc.student_id].append({"class_id":c.id,"class_name":c.class_name,"batch":c.batch,"subject":sub.name if sub else "","teacher_id":t.teacher_id if t else None,"teacher_name":t.name if t else None,"day":DAYS[tc.day_of_week],"day_of_week":tc.day_of_week,"start_time":tc.start_time.strftime("%H:%M"),"end_time":tc.end_time.strftime("%H:%M"),"room":c.room})
    return out


def _student_objs_bulk(students, private=True):
    students=list(students)
    if not students: return []
    ids=[s.id for s in students]
    classes_by_student=_student_classes_bulk(ids)
    parent_ids={s.parent_id for s in students if s.parent_id}
    parents={x.id:x for x in Parent.query.filter(Parent.id.in_(parent_ids)).all()} if parent_ids else {}
    month=today_ist().replace(day=1)
    # One query for all applicable fee structures instead of one query per student.
    fee_rows=(FeeStructure.query
        .join(StudentClass,StudentClass.class_id==FeeStructure.class_id)
        .filter(StudentClass.student_id.in_(ids),StudentClass.status=="active",FeeStructure.status=="active",FeeStructure.effective_from<=month)
        .filter((FeeStructure.effective_to.is_(None))|(FeeStructure.effective_to>=month))
        .order_by(FeeStructure.class_id.asc(),FeeStructure.effective_from.desc(),FeeStructure.id.desc()).all())
    fee_by_student={sid:Decimal("0.00") for sid in ids}
    seen=set()
    # Same fee structure can apply to multiple students; add once per student/class.
    student_class_ids={sid:set() for sid in ids}
    for sid,rows in []: pass
    sc_rows=StudentClass.query.filter(StudentClass.student_id.in_(ids),StudentClass.status=="active").all()
    for sc in sc_rows: student_class_ids[sc.student_id].add(sc.class_id)
    newest={}
    for row in fee_rows:
        key=(row.class_id,row.effective_from,row.id)
        newest.setdefault(row.class_id,row)
    for sid in ids:
        fee_by_student[sid]=sum((Decimal(str(newest[cid].monthly_fee)) for cid in student_class_ids[sid] if cid in newest),Decimal("0.00"))
    payments={p.student_id:p for p in FeePayment.query.filter(FeePayment.student_id.in_(ids),FeePayment.fee_month==month).all()}
    out=[]
    for s in students:
        p=parents.get(s.parent_id) if s.parent_id else None
        current_due=fee_by_student.get(s.id,Decimal("0.00")); payment=payments.get(s.id)
        current_month_status="PAID" if payment else ("DUE" if current_due>0 else "N/A")
        x={"id":s.id,"student_id":s.student_id,"name":s.name,"photo":s.photo,"gender":s.gender,"dob":s.dob.isoformat() if s.dob else None,"phone":s.phone,"school_name":s.school_name,"admission_date":s.admission_date.isoformat() if s.admission_date else None,"status":s.status,"classes":classes_by_student.get(s.id,[]),"current_month_status":current_month_status}
        if private:
            x["address"]=s.address
            x["parent"]={"name":p.name,"relationship":p.relationship,"phone":p.phone,"email":p.email,"address":p.address} if p else None
        out.append(x)
    return out



def _week_start(d):
    return d - timedelta(days=d.weekday())

def _schedule_overrides(class_id, week_start):
    return ScheduleException.query.filter_by(class_id=class_id, week_start=week_start).all()

def _effective_class_schedule(c, start_date, days=7):
    overrides=_schedule_overrides(c.id,_week_start(start_date))
    allocations=TeacherClass.query.filter_by(class_id=c.id,status="active").all()
    teacher_ids={a.teacher_id for a in allocations}
    teacher_ids.update(e.teacher_id for e in overrides if e.teacher_id)
    teachers={t.id:t for t in Teacher.query.filter(Teacher.id.in_(teacher_ids or [-1])).all()}
    out=[]
    for off in range(days):
        d=start_date+timedelta(days=off)
        for tc in allocations:
            if tc.day_of_week != d.weekday(): continue
            specific=next((e for e in overrides if e.allocation_id==tc.id and e.schedule_date==d and e.kind in ("delete","reschedule")),None)
            if specific and specific.kind=="delete": continue
            ex=next((e for e in overrides if e.allocation_id==tc.id and e.kind=="weekly_time"),None)
            start=(specific.start_time if specific and specific.start_time else (ex.start_time if ex and ex.start_time else tc.start_time))
            end=(specific.end_time if specific and specific.end_time else (ex.end_time if ex and ex.end_time else tc.end_time))
            tid=(specific.teacher_id if specific and specific.teacher_id else tc.teacher_id)
            t=teachers.get(tid)
            out.append({"date":d.isoformat(),"allocation_id":tc.id,"teacher_id":t.id if t else None,
                        "teacher_code":t.teacher_id if t else None,"teacher_name":t.name if t else None,
                        "start_time":start.strftime("%H:%M"),"end_time":end.strftime("%H:%M"),
                        "day_of_week":d.weekday(),"room":c.room,"kind":"rescheduled" if specific else "regular"})
    for ex in overrides:
        if ex.kind=="extra" and ex.schedule_date and start_date <= ex.schedule_date < start_date+timedelta(days=days):
            t=teachers.get(ex.teacher_id)
            out.append({"date":ex.schedule_date.isoformat(),"allocation_id":None,"teacher_id":t.id if t else None,
                        "teacher_code":t.teacher_id if t else None,"teacher_name":t.name if t else None,
                        "start_time":ex.start_time.strftime("%H:%M") if ex.start_time else "",
                        "end_time":ex.end_time.strftime("%H:%M") if ex.end_time else "",
                        "day_of_week":ex.schedule_date.weekday(),"room":c.room,"kind":"extra"})
    for ex in overrides:
        if ex.kind=="reschedule" and ex.target_date and start_date <= ex.target_date < start_date+timedelta(days=days):
            t=teachers.get(ex.teacher_id)
            if t is None and ex.allocation_id:
                tc=TeacherClass.query.get(ex.allocation_id); t=teachers.get(tc.teacher_id) if tc else None
            out.append({"date":ex.target_date.isoformat(),"allocation_id":ex.allocation_id,"teacher_id":t.id if t else None,
                        "teacher_code":t.teacher_id if t else None,"teacher_name":t.name if t else None,
                        "start_time":ex.start_time.strftime("%H:%M") if ex.start_time else "",
                        "end_time":ex.end_time.strftime("%H:%M") if ex.end_time else "",
                        "day_of_week":ex.target_date.weekday(),"room":c.room,"kind":"rescheduled"})
    return sorted(out,key=lambda x:(x["date"],x["start_time"],x["teacher_name"] or ""))

def class_obj(c):
    subjects={s.id:s for s in Subject.query.filter(Subject.id==c.subject_id).all()}
    alloc_rows=TeacherClass.query.filter_by(class_id=c.id,status="active").all()
    tids={x.teacher_id for x in alloc_rows}
    teachers={t.id:t for t in Teacher.query.filter(Teacher.id.in_(tids)).all()} if tids else {}
    s=subjects.get(c.subject_id)
    return {"id":c.id,"class_name":c.class_name,"batch":c.batch,"subject_id":c.subject_id,"subject":s.name if s else "","room":c.room,"max_students":c.max_students,"status":c.status,"student_count":StudentClass.query.filter_by(class_id=c.id,status="active").count(),"allocations":[{"allocation_id":tc.id,"teacher_id":teachers.get(tc.teacher_id).teacher_id if teachers.get(tc.teacher_id) else None,"teacher_name":teachers.get(tc.teacher_id).name if teachers.get(tc.teacher_id) else None,"day":DAYS[tc.day_of_week],"day_of_week":tc.day_of_week,"start_time":tc.start_time.strftime("%H:%M"),"end_time":tc.end_time.strftime("%H:%M"),"room":c.room} for tc in alloc_rows]}


def _class_objs_bulk(classes):
    classes=list(classes)
    if not classes:return []
    ids=[c.id for c in classes]; subject_ids={c.subject_id for c in classes}
    subjects={x.id:x for x in Subject.query.filter(Subject.id.in_(subject_ids)).all()} if subject_ids else {}
    tc_rows=TeacherClass.query.filter(TeacherClass.class_id.in_(ids),TeacherClass.status=="active").all()
    teacher_ids={x.teacher_id for x in tc_rows}
    teachers={x.id:x for x in Teacher.query.filter(Teacher.id.in_(teacher_ids)).all()} if teacher_ids else {}
    counts=dict(db.session.query(StudentClass.class_id,func.count(StudentClass.id)).filter(StudentClass.class_id.in_(ids),StudentClass.status=="active").group_by(StudentClass.class_id).all())
    alloc_by_class={}
    for tc in tc_rows:alloc_by_class.setdefault(tc.class_id,[]).append(tc)
    out=[]
    for c in classes:
        sub=subjects.get(c.subject_id)
        out.append({"id":c.id,"class_name":c.class_name,"batch":c.batch,"subject_id":c.subject_id,"subject":sub.name if sub else "","room":c.room,"max_students":c.max_students,"status":c.status,"student_count":int(counts.get(c.id,0)),"allocations":[{"allocation_id":tc.id,"teacher_id":teachers.get(tc.teacher_id).teacher_id if teachers.get(tc.teacher_id) else None,"teacher_name":teachers.get(tc.teacher_id).name if teachers.get(tc.teacher_id) else None,"day":DAYS[tc.day_of_week],"day_of_week":tc.day_of_week,"start_time":tc.start_time.strftime("%H:%M"),"end_time":tc.end_time.strftime("%H:%M"),"room":c.room} for tc in alloc_by_class.get(c.id,[])]})
    return out


def teacher_obj(t):
    return _teacher_objs_bulk([t])[0]


def _teacher_objs_bulk(teachers):
    teachers=list(teachers)
    if not teachers:return []
    ids=[t.id for t in teachers]
    tc_rows=TeacherClass.query.filter(TeacherClass.teacher_id.in_(ids),TeacherClass.status=="active").all()
    class_ids={x.class_id for x in tc_rows}
    classes={c.id:c for c in Class.query.filter(Class.id.in_(class_ids)).all()} if class_ids else {}
    subject_ids={c.subject_id for c in classes.values()}
    subjects={x.id:x for x in Subject.query.filter(Subject.id.in_(subject_ids)).all()} if subject_ids else {}
    by_teacher={tid:[] for tid in ids}
    for tc in tc_rows:
        c=classes.get(tc.class_id)
        if not c:continue
        sub=subjects.get(c.subject_id)
        by_teacher[tc.teacher_id].append({"class_id":c.id,"class_name":c.class_name,"batch":c.batch,"subject":sub.name if sub else "","day":DAYS[tc.day_of_week],"start_time":tc.start_time.strftime("%H:%M"),"end_time":tc.end_time.strftime("%H:%M"),"room":c.room})
    return [{"id":t.id,"teacher_id":t.teacher_id,"name":t.name,"photo":t.photo,"gender":t.gender,"dob":t.dob.isoformat() if t.dob else None,"phone":t.phone,"email":t.email,"address":t.address,"qualification":t.qualification,"experience":t.experience,"joining_date":t.joining_date.isoformat() if t.joining_date else None,"status":t.status,"classes":by_teacher.get(t.id,[])} for t in teachers]


def student_obj(s,private=True):
    return _student_objs_bulk([s],private=private)[0]


def _homework_objs_bulk(rows):
    rows=list(rows)
    if not rows:return []
    cids={x.class_id for x in rows}; sids={x.subject_id for x in rows}; tids={x.teacher_id for x in rows}
    classes={x.id:x for x in Class.query.filter(Class.id.in_(cids)).all()} if cids else {}
    subjects={x.id:x for x in Subject.query.filter(Subject.id.in_(sids)).all()} if sids else {}
    teachers={x.id:x for x in Teacher.query.filter(Teacher.id.in_(tids)).all()} if tids else {}
    return [{"id":h.id,"class_id":h.class_id,"class_name":classes[h.class_id].class_name if h.class_id in classes else "","batch":classes[h.class_id].batch if h.class_id in classes else "","teacher_name":teachers[h.teacher_id].name if h.teacher_id in teachers else "","subject_id":h.subject_id,"subject":subjects[h.subject_id].name if h.subject_id in subjects else "","homework_date":h.homework_date.isoformat(),"due_date":h.due_date.isoformat(),"title":h.title,"description":h.description} for h in rows]


def homework_obj(h): return _homework_objs_bulk([h])[0]


def _classwork_objs_bulk(rows):
    rows=list(rows)
    if not rows:return []
    cids={x.class_id for x in rows}; sids={x.subject_id for x in rows}; tids={x.teacher_id for x in rows}
    classes={x.id:x for x in Class.query.filter(Class.id.in_(cids)).all()} if cids else {}
    subjects={x.id:x for x in Subject.query.filter(Subject.id.in_(sids)).all()} if sids else {}
    teachers={x.id:x for x in Teacher.query.filter(Teacher.id.in_(tids)).all()} if tids else {}
    return [{"id":w.id,"class_id":w.class_id,"class_name":classes[w.class_id].class_name if w.class_id in classes else "","batch":classes[w.class_id].batch if w.class_id in classes else "","teacher_name":teachers[w.teacher_id].name if w.teacher_id in teachers else "","subject_id":w.subject_id,"subject":subjects[w.subject_id].name if w.subject_id in subjects else "","work_date":w.work_date.isoformat(),"topic":w.topic,"description":w.description,"notes":w.notes} for w in rows]


def classwork_obj(w): return _classwork_objs_bulk([w])[0]

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

@api.get("/public/stats")
def public_stats():
    """Public landing-page counters. Only aggregate active totals are exposed."""
    return ok({
        "total_students": Student.query.filter_by(status="active").count(),
        "total_teachers": Teacher.query.filter_by(status="active").count(),
    })

@api.get("/admin/dashboard")
@roles("admin")
def admin_dashboard():
    m=today_ist().replace(day=1)
    active_students=Student.query.filter_by(status="active").all()
    ids=[s.id for s in active_students]
    fee_rows=(FeeStructure.query.join(StudentClass,StudentClass.class_id==FeeStructure.class_id)
        .filter(StudentClass.student_id.in_(ids or [-1]),StudentClass.status=="active",FeeStructure.status=="active",FeeStructure.effective_from<=m)
        .filter((FeeStructure.effective_to.is_(None))|(FeeStructure.effective_to>=m))
        .order_by(FeeStructure.class_id.asc(),FeeStructure.effective_from.desc(),FeeStructure.id.desc()).all())
    latest_by_class={}
    for row in fee_rows: latest_by_class.setdefault(row.class_id,row)
    assigned={sid:set() for sid in ids}
    for sc in StudentClass.query.filter(StudentClass.student_id.in_(ids or [-1]),StudentClass.status=="active").all(): assigned[sc.student_id].add(sc.class_id)
    paid={p.student_id for p in FeePayment.query.filter(FeePayment.student_id.in_(ids or [-1]),FeePayment.fee_month==m).all()}
    due=sum(1 for sid in ids if sid not in paid and any(cid in latest_by_class for cid in assigned[sid]))
    unresolved_complaints=Complaint.query.filter(Complaint.status!="resolved").count()
    new_enquiries=Enquiry.query.filter_by(status="new").count()
    return ok({
        "total_students":Student.query.filter_by(status="active").count(),
        "total_teachers":Teacher.query.filter_by(status="active").count(),
        "total_classes":Class.query.filter_by(status="active").count(),
        "fees_due":due,
        "complaints":unresolved_complaints,
        "enquiries":new_enquiries
    })

@api.get("/teachers")
@roles("admin")
def teachers():
    q=request.args.get("q","").strip();st=request.args.get("status")
    query=Teacher.query
    if q: query=query.filter(or_(Teacher.teacher_id.like(f"%{q}%"),Teacher.name.like(f"%{q}%"),Teacher.phone.like(f"%{q}%"),Teacher.email.like(f"%{q}%")))
    if st in ("active","inactive"):query=query.filter_by(status=st)
    return ok(_teacher_objs_bulk(query.order_by(Teacher.name).all()))
@api.get("/teachers/<int:id>")
@roles("admin")
def teacher(id):
    t=Teacher.query.get(id);return ok(teacher_obj(t)) if t else err("Teacher not found",404)
@api.post("/teachers")
@roles("admin")
def add_teacher():
    b=request.get_json() or {};name=str(b.get("name","")).strip();pw=str(b.get("password","")).strip()
    if not name:return err("Full name is required")
    if not pw:return err("Password is required. Generate or enter a password before registering.")
    last=Teacher.query.order_by(Teacher.id.desc()).first()
    try:last_no=int(last.teacher_id.rsplit("-",1)[-1]) if last and last.teacher_id.rsplit("-",1)[-1].isdigit() else Teacher.query.count()
    except Exception:last_no=Teacher.query.count()
    tid=f"TCH-{last_no+1:05d}";username=tid
    if User.query.filter_by(username=username).first():return err("Teacher ID already exists. Please try again.",409)
    try:
        u=User(username=username,password_hash=hp(pw),role="teacher");db.session.add(u);db.session.flush()
        t=Teacher(user_id=u.id,teacher_id=tid,name=name,photo=b.get("photo"),gender=b.get("gender"),dob=pd(b.get("dob")),phone=b.get("phone"),email=b.get("email"),address=b.get("address"),qualification=b.get("qualification"),experience=b.get("experience"),joining_date=pd(b.get("joining_date")));db.session.add(t);db.session.flush();audit(current_user().id,"register","teacher",t.id,tid);db.session.commit()
        return ok({"teacher":teacher_obj(t),"credentials":{"username":username,"temporary_password":pw}},"Teacher registered successfully",201)
    except Exception:
        db.session.rollback();return err("Could not register teacher")

@api.put("/teachers/<int:id>")
@roles("admin")
def edit_teacher(id):
    t=Teacher.query.get(id)
    if not t:return err("Teacher not found",404)
    u=User.query.get(t.user_id)
    b=request.get_json(silent=True) or {}
    try:
        for k in ("name","photo","gender","phone","email","address","qualification","experience","status"):
            if k in b:setattr(t,k,b[k])
        if t.status not in ("active","inactive"): return err("Invalid teacher status")
        if "dob" in b:t.dob=pd(b.get("dob"))
        if "joining_date" in b:t.joining_date=pd(b.get("joining_date"))
        if "password" in b and str(b.get("password") or "").strip():
            u.password_hash=hp(str(b.get("password")).strip())
        if u:
            u.is_active=(t.status=="active")
        audit(current_user().id,"update","teacher",t.id,t.teacher_id);
        db.session.commit()
        return ok(teacher_obj(t),"Teacher updated")
    except (TypeError,ValueError):
        db.session.rollback();return err("Invalid teacher details")
    except Exception:
        db.session.rollback();return err("Could not update teacher")
@api.delete("/teachers/<int:id>")
@roles("admin")
def remove_teacher(id):
    t=Teacher.query.get(id)
    if not t:return err("Teacher not found",404)
    t.status="inactive";u=User.query.get(t.user_id);u.is_active=False
    for x in TeacherClass.query.filter_by(teacher_id=t.id).all():x.status="inactive"
    audit(current_user().id,"unregister","teacher",t.id,t.teacher_id);db.session.commit();return ok(message="Teacher unregistered successfully")


@api.get("/schedule-exceptions")
@roles("admin")
def schedule_exceptions():
    cid=request.args.get("class_id",type=int)
    ws=request.args.get("week_start")
    if not cid:return err("class_id is required")
    try: week=date.fromisoformat(ws) if ws else _week_start(today_ist())
    except Exception:return err("Invalid week_start")
    rows=_schedule_overrides(cid,week)
    return ok([{"id":x.id,"allocation_id":x.allocation_id,"kind":x.kind,"week_start":x.week_start.isoformat(),
                "schedule_date":x.schedule_date.isoformat() if x.schedule_date else None,
                "target_date":x.target_date.isoformat() if x.target_date else None,
                "start_time":x.start_time.strftime("%H:%M") if x.start_time else None,
                "end_time":x.end_time.strftime("%H:%M") if x.end_time else None,
                "teacher_id":x.teacher_id} for x in rows])

@api.post("/schedule-exceptions")
@roles("admin")
def create_schedule_exception():
    b=request.get_json(silent=True) or {}
    try:
        cid=int(b["class_id"]); c=Class.query.get(cid)
        if not c or c.status!="active":return err("Course not found",404)
        kind=str(b.get("kind","")).strip().lower()
        if kind not in ("delete","reschedule","extra","weekly_time"):return err("Invalid schedule action")
        ws=date.fromisoformat(str(b["week_start"]))
        allocation_id=int(b["allocation_id"]) if b.get("allocation_id") else None
        schedule_date=date.fromisoformat(b["schedule_date"]) if b.get("schedule_date") else None
        target_date=date.fromisoformat(b["target_date"]) if b.get("target_date") else None
        teacher_id=int(b["teacher_id"]) if b.get("teacher_id") else None
        start=pt(b["start_time"],True) if b.get("start_time") else None
        end=pt(b["end_time"],True) if b.get("end_time") else None
        if kind in ("reschedule","extra","weekly_time") and (not start or not end or start>=end):return err("Valid start and end time are required")
        if kind in ("delete","reschedule") and (not allocation_id or not schedule_date):return err("Original class and date are required")
        if kind=="reschedule" and not target_date:return err("New date is required")
        if kind=="extra" and not schedule_date:return err("Extra class date is required")
        if kind=="weekly_time" and not allocation_id:return err("Class allocation is required")
        if allocation_id:
            tc=TeacherClass.query.get(allocation_id)
            if not tc or tc.class_id!=cid or tc.status!="active":return err("Allocation not found",404)
            if kind in ("delete","reschedule") and schedule_date.weekday()!=tc.day_of_week:return err("Original date must be the normal class day")
        if teacher_id and not Teacher.query.get(teacher_id):return err("Teacher not found",404)
        if kind=="extra" and not teacher_id:return err("Teacher is required for an extra class")
        if kind=="reschedule" and target_date.weekday()==schedule_date.weekday() and start==tc.start_time and end==tc.end_time:
            return err("Choose a different date or time")
        ex=ScheduleException(class_id=cid,allocation_id=allocation_id,week_start=ws,schedule_date=schedule_date,
            target_date=target_date,kind=kind,start_time=start,end_time=end,
            teacher_id=teacher_id or (TeacherClass.query.get(allocation_id).teacher_id if allocation_id else None),
            created_by=current_user().id)
        db.session.add(ex);audit(current_user().id,"schedule_change","schedule_exception",None,f"{kind} for class {c.class_name} week {ws}");db.session.commit()
        return ok({"id":ex.id},"Schedule updated",201)
    except Exception:
        db.session.rollback();return err("Invalid schedule change")

@api.delete("/schedule-exceptions/<int:id>")
@roles("admin")
def delete_schedule_exception(id):
    ex=ScheduleException.query.get(id)
    if not ex:return err("Schedule change not found",404)
    db.session.delete(ex);db.session.commit();return ok(message="Schedule change removed")

@api.get("/classes")
@roles("admin","teacher","student")
def classes():
    # The public/admin application should only ever receive active classes.
    # A deactivated class is permanently deleted by the admin mutation above.
    q=request.args.get("q","").strip()
    query=Class.query.filter_by(status="active")
    if q:query=query.filter(or_(Class.class_name.like(f"%{q}%"),Class.batch.like(f"%{q}%")))
    return ok(_class_objs_bulk(query.order_by(Class.class_name,Class.batch).all()))
@api.get("/classes/<int:id>")
@roles("admin")
def get_class(id):
    c=Class.query.get(id)
    if not c or c.status!="active":return err("Course not found",404)
    students=(Student.query.join(StudentClass,StudentClass.student_id==Student.id)
              .filter(StudentClass.class_id==id,StudentClass.status=="active")
              .order_by(Student.name.asc()).all())
    data=class_obj(c)
    data["students"]=[{"id":s.id,"student_id":s.student_id,"name":s.name,"phone":s.phone,"status":s.status} for s in students]
    return ok(data)


@api.get("/classes/<int:id>/schedule-week")
@roles("admin","teacher","student")
def class_schedule_week(id):
    c=Class.query.get(id)
    if not c or c.status!="active":return err("Course not found",404)
    ws=request.args.get("week_start")
    try:start=date.fromisoformat(ws) if ws else _week_start(today_ist())
    except Exception:return err("Invalid week_start")
    return ok(_effective_class_schedule(c,start,7))

@api.delete("/student-classes/<int:id>")
@roles("admin")
def remove_student_class(id):
    sc=StudentClass.query.get(id)
    if not sc:return err("Class assignment not found",404)
    sc.status="inactive"
    db.session.commit()
    return ok(message="Student removed from course")

@api.delete("/classes/<int:class_id>/students/<int:student_id>")
@roles("admin")
def remove_student_from_class(class_id,student_id):
    sc=StudentClass.query.filter_by(class_id=class_id,student_id=student_id,status="active").first()
    if not sc:return err("Active student assignment not found",404)
    sc.status="inactive"
    db.session.commit()
    return ok(message="Student removed from course")
@api.post("/classes")
@roles("admin")
def add_class():
    b=request.get_json() or {}
    try:c=Class(class_name=str(b["class_name"]).strip(),batch=str(b["batch"]).strip(),subject_id=int(b["subject_id"]),room=b.get("room"),max_students=int(b.get("max_students",30)));db.session.add(c);db.session.flush();audit(current_user().id,"create","class",c.id,c.class_name);db.session.commit();return ok(class_obj(c),"Class created",201)
    except Exception:db.session.rollback();return err("Invalid class data")
def _permanently_delete_class(c):
    """Remove a class and every class-owned record so it cannot surface anywhere."""
    cid=c.id
    # Clear optional complaint references explicitly; this keeps the behavior
    # correct even on MySQL installs where the SET NULL FK was not recreated.
    Complaint.query.filter_by(class_id=cid).update({Complaint.class_id:None}, synchronize_session=False)
    TeacherClass.query.filter_by(class_id=cid).delete(synchronize_session=False)
    StudentClass.query.filter_by(class_id=cid).delete(synchronize_session=False)
    FeeStructure.query.filter_by(class_id=cid).delete(synchronize_session=False)
    Homework.query.filter_by(class_id=cid).delete(synchronize_session=False)
    Classwork.query.filter_by(class_id=cid).delete(synchronize_session=False)
    Attendance.query.filter_by(class_id=cid).delete(synchronize_session=False)
    audit(current_user().id,"delete","class",cid,f"Deleted course {c.class_name} · {c.batch}")
    db.session.delete(c)

@api.put("/classes/<int:id>")
@roles("admin")
def edit_class(id):
    c=Class.query.get(id)
    if not c:return err("Class not found",404)
    b=request.get_json() or {}
    # "Inactive" is treated as permanent deletion everywhere.
    if str(b.get("status", "")).lower() == "inactive":
        try:
            _permanently_delete_class(c)
            db.session.commit()
            return ok(message="Class deleted permanently")
        except Exception:
            db.session.rollback()
            return err("Could not delete class. Please try again.",500)
    for k in ("class_name","batch","room"): 
        if k in b:setattr(c,k,b[k])
    for k in ("subject_id","max_students"):
        if k in b:setattr(c,k,int(b[k]))
    c.status="active"
    db.session.commit();return ok(class_obj(c),"Class updated")

@api.delete("/classes/<int:id>")
@roles("admin")
def deactivate_class(id):
    c=Class.query.get(id)
    if not c:return err("Class not found",404)
    try:
        _permanently_delete_class(c)
        db.session.commit()
        return ok(message="Class deleted permanently")
    except Exception:
        db.session.rollback()
        return err("Could not delete class. Please try again.",500)

@api.post("/teacher-classes")
@roles("admin")
def add_allocation():
    b=request.get_json() or {}
    try:
        tid=int(b["teacher_id"]);cid=int(b["class_id"]);start=pt(b["start_time"],True);end=pt(b["end_time"],True)
        days=b.get("day_of_week_multi") or b.get("day_of_week")
        if not isinstance(days,list): days=[days]
        days=[int(x) for x in days if str(x).strip()!=""]
        if not days: return err("Select at least one day")
        if start>=end:return err("End time must be after start time")
        for day in days:
            if TeacherClass.query.filter(TeacherClass.teacher_id==tid,TeacherClass.day_of_week==day,TeacherClass.status=="active",TeacherClass.start_time<end,TeacherClass.end_time>start).first():return err("Teacher schedule overlaps",409)
        for day in days: db.session.add(TeacherClass(teacher_id=tid,class_id=cid,day_of_week=day,start_time=start,end_time=end))
        db.session.commit();return ok(class_obj(Class.query.get(cid)),"Class assigned",201)
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
    b=request.get_json() or {}
    try:sid=int(b.get("student_id"));cid=int(b.get("class_id"));s=Student.query.get(sid);c=Class.query.get(cid)
    except (TypeError,ValueError):return err("Invalid student or course")
    if not s or not c:return err("Student or course not found",404)
    if s.status!="active" or c.status!="active":return err("Only active students and courses can be assigned")
    existing=StudentClass.query.filter_by(student_id=sid,class_id=cid).first()
    if existing and existing.status=="active":return err("Student is already assigned",409)
    if StudentClass.query.filter_by(class_id=cid,status="active").count()>=c.max_students:return err("Course capacity reached",409)
    if existing:
        existing.status="active";existing.assigned_at=datetime.utcnow()
    else:db.session.add(StudentClass(student_id=sid,class_id=cid))
    db.session.commit();return ok(message="Student assigned to course")

@api.get("/students")
@roles("admin")
def students():
    q=request.args.get("q","").strip();st=request.args.get("status");query=Student.query
    if q:
        ids=[p.id for p in Parent.query.filter(or_(Parent.name.like(f"%{q}%"),Parent.phone.like(f"%{q}%"))).all()]
        query=query.filter(or_(Student.student_id.like(f"%{q}%"),Student.name.like(f"%{q}%"),Student.phone.like(f"%{q}%"),Student.parent_id.in_(ids or [-1])))
    if st in ("active","inactive"):query=query.filter_by(status=st)
    return ok(_student_objs_bulk(query.order_by(Student.name).all()))
@api.get("/students/<int:id>")
@roles("admin")
def student(id):
    s=Student.query.get(id);return ok(student_obj(s)) if s else err("Student not found",404)
@api.post("/students")
@roles("admin")
def add_student():
    b=request.get_json() or {};name=str(b.get("name","")).strip();pw=str(b.get("password","")).strip()
    if not name:return err("Full name is required")
    if not pw:return err("Password is required. Generate or enter a password before registering.")
    last=Student.query.order_by(Student.id.desc()).first()
    try:last_no=int(last.student_id.rsplit("-",1)[-1]) if last and last.student_id.rsplit("-",1)[-1].isdigit() else Student.query.count()
    except Exception:last_no=Student.query.count()
    sid=f"STD-{last_no+1:05d}";username=sid
    if User.query.filter_by(username=username).first():return err("Student ID already exists. Please try again.",409)
    try:
        u=User(username=username,password_hash=hp(pw),role="student");db.session.add(u);db.session.flush()
        pdat=b.get("parent") or {};p=None
        if str(pdat.get("name","")).strip():p=Parent(name=pdat["name"],relationship=pdat.get("relationship"),phone=pdat.get("phone"),email=pdat.get("email"),address=pdat.get("address"));db.session.add(p);db.session.flush()
        s=Student(user_id=u.id,student_id=sid,name=name,photo=b.get("photo"),gender=b.get("gender"),dob=pd(b.get("dob")),phone=b.get("phone"),address=b.get("address"),school_name=b.get("school_name"),admission_date=pd(b.get("admission_date")),parent_id=p.id if p else None);db.session.add(s);db.session.flush()
        for cid in b.get("class_ids",[]):
            c=Class.query.get(int(cid))
            if c and c.status=="active":db.session.add(StudentClass(student_id=s.id,class_id=c.id))
        audit(current_user().id,"register","student",s.id,sid);db.session.commit()
        return ok({"student":student_obj(s),"credentials":{"username":username,"temporary_password":pw}},"Student registered successfully",201)
    except Exception:
        db.session.rollback();return err("Could not register student")

@api.put("/students/<int:id>")
@roles("admin")
def edit_student(id):
    s=Student.query.get(id)
    if not s:return err("Student not found",404)
    u=User.query.get(s.user_id)
    b=request.get_json(silent=True) or {}
    try:
        for k in ("name","photo","gender","phone","address","school_name","status"):
            if k in b:setattr(s,k,b[k])
        if s.status not in ("active","inactive"): return err("Invalid student status")
        if "dob" in b:s.dob=pd(b.get("dob"))
        if "admission_date" in b:s.admission_date=pd(b.get("admission_date"))
        if "password" in b and str(b.get("password") or "").strip():
            u.password_hash=hp(str(b.get("password")).strip())
        if u:
            u.is_active=(s.status=="active")

        pdat=b.get("parent")
        if isinstance(pdat,dict):
            if s.parent_id:
                p=Parent.query.get(s.parent_id)
            else:
                p=None
            has_parent_data=any(str(pdat.get(k) or "").strip() for k in ("name","relationship","phone","email","address"))
            if p is None and has_parent_data:
                if not str(pdat.get("name") or "").strip():
                    return err("Guardian name is required when guardian details are supplied")
                p=Parent(name=str(pdat.get("name")).strip())
                db.session.add(p);db.session.flush();s.parent_id=p.id
            if p:
                for k in ("name","relationship","phone","email","address"):
                    if k in pdat:setattr(p,k,pdat[k])
        audit(current_user().id,"update","student",s.id,s.student_id)
        db.session.commit()
        return ok(student_obj(s),"Student updated")
    except (TypeError,ValueError):
        db.session.rollback();return err("Invalid student details")
    except Exception:
        db.session.rollback();return err("Could not update student")
@api.delete("/students/<int:id>")
@roles("admin")
def remove_student(id):
    s=Student.query.get(id)
    if not s:return err("Student not found",404)
    s.status="inactive";u=User.query.get(s.user_id);u.is_active=False
    for x in StudentClass.query.filter_by(student_id=id).all():x.status="inactive"
    db.session.commit();return ok(message="Student unregistered successfully")

@api.get("/students/<int:id>/attendance")
@roles("admin")
def admin_student_attendance(id):
    s=Student.query.get(id)
    if not s:return err("Student not found",404)
    month_raw=request.args.get("month",today_ist().strftime("%Y-%m"))
    try:
        month_start=date.fromisoformat(month_raw+"-01")
    except ValueError:
        return err("Invalid month. Use YYYY-MM")
    next_month=(month_start+timedelta(days=32)).replace(day=1)
    rows=(Attendance.query.filter(Attendance.student_id==id,Attendance.attendance_date>=month_start,Attendance.attendance_date<next_month)
          .order_by(Attendance.attendance_date.asc(),Attendance.class_id.asc()).all())
    # A calendar has one colour per date. If a student has multiple course records
    # on the same date, mark the date absent if any course was absent; otherwise present.
    grouped={}
    for r in rows:
        item=grouped.setdefault(r.attendance_date.isoformat(),{"status":"present","courses":[]})
        if r.status=="absent": item["status"]="absent"
        c=Class.query.get(r.class_id)
        sub=subject_obj(c.subject_id) if c else None
        item["courses"].append({"class_id":r.class_id,"course":c.class_name if c else "","batch":c.batch if c else "","subject":sub.name if sub else "","status":r.status})
    return ok({"student":{"id":s.id,"student_id":s.student_id,"name":s.name},"month":month_start.strftime("%Y-%m"),"records":grouped})

@api.get("/admin/classes/<int:class_id>/attendance/history")
@roles("admin")
def admin_class_attendance_history(class_id):
    c=Class.query.get(class_id)
    if not c:return err("Course not found",404)
    if c.status!="active":return err("Course is inactive",404)
    date_filter=request.args.get("date","").strip()
    from_date=request.args.get("from","").strip()
    to_date=request.args.get("to","").strip()
    query=Attendance.query.filter_by(class_id=class_id)
    try:
        if date_filter:
            query=query.filter(Attendance.attendance_date==date.fromisoformat(date_filter))
        elif from_date or to_date:
            if from_date: query=query.filter(Attendance.attendance_date>=date.fromisoformat(from_date))
            if to_date: query=query.filter(Attendance.attendance_date<=date.fromisoformat(to_date))
    except ValueError:
        return err("Invalid attendance date")
    records=query.order_by(Attendance.attendance_date.desc(),Attendance.student_id.asc()).all()
    student_ids={r.student_id for r in records}
    students={s.id:s for s in Student.query.filter(Student.id.in_(student_ids)).all()} if student_ids else {}
    grouped={}
    for r in records:
        key=r.attendance_date.isoformat()
        grouped.setdefault(key,[]).append({
            "student_id":students[r.student_id].student_id if r.student_id in students else "",
            "name":students[r.student_id].name if r.student_id in students else "Unknown",
            "status":r.status
        })
    days=[]
    for day,items in grouped.items():
        items.sort(key=lambda x:x["name"].lower())
        days.append({
            "date":day,
            "day":date.fromisoformat(day).strftime("%A"),
            "present":sum(1 for x in items if x["status"]=="present"),
            "absent":sum(1 for x in items if x["status"]=="absent"),
            "students":items
        })
    sub=subject_obj(c.subject_id)
    return ok({"class_id":class_id,"class_name":c.class_name,"batch":c.batch,"subject":sub.name if sub else "","history":days})

@api.get("/complaints")
@roles("admin")
def admin_complaints():
    status=request.args.get("status","").strip()
    query=Complaint.query
    if status in ("open","in_progress","resolved"): query=query.filter_by(status=status)
    out=[]
    for c in query.order_by(Complaint.created_at.desc(),Complaint.id.desc()).all():
        cls=Class.query.get(c.class_id) if c.class_id else None
        sub=subject_obj(cls.subject_id) if cls else None
        class_label=(f"{cls.class_name} · {cls.batch}" if cls else "Not mentioned")
        out.append({
            "id":c.id,
            "complaint_date":c.complaint_date.isoformat(),
            "subject":c.subject,
            "description":c.description,
            "class_name":class_label,
            "class_subject":sub.name if sub else "",
            "status":c.status,
            "admin_note":c.admin_note,
            "created_at":iso_ist(c.created_at)
        })
    return ok(out)

@api.put("/complaints/<int:id>")
@roles("admin")
def update_complaint(id):
    c=Complaint.query.get(id)
    if not c:return err("Complaint not found",404)
    b=request.get_json() or {}
    if "status" in b and b["status"] in ("open","in_progress","resolved"): c.status=b["status"]
    if "admin_note" in b: c.admin_note=str(b.get("admin_note") or "").strip() or None
    db.session.commit()
    return ok({"id":c.id,"status":c.status,"admin_note":c.admin_note},"Complaint updated")

@api.get("/student/complaints")
@roles("student")
def student_complaints():
    s=student_for_user()
    rows=Complaint.query.filter_by(student_id=s.id).order_by(Complaint.complaint_date.desc(),Complaint.created_at.desc()).all()
    return ok([{"id":c.id,"complaint_date":c.complaint_date.isoformat(),"subject":c.subject,"description":c.description,"class_id":c.class_id,"status":c.status,"admin_note":c.admin_note,"created_at":iso_ist(c.created_at)} for c in rows])

@api.get("/student/complaint-classes")
@roles("student")
def student_complaint_classes():
    s=student_for_user()
    seen=set(); out=[]
    for sc in StudentClass.query.filter_by(student_id=s.id,status="active").all():
        if sc.class_id in seen: continue
        c=Class.query.get(sc.class_id)
        if not c or c.status!="active": continue
        sub=subject_obj(c.subject_id)
        out.append({"id":c.id,"label":f"{c.class_name} · {c.batch}","subject":sub.name if sub else ""})
        seen.add(c.id)
    out.sort(key=lambda x:x["label"].lower())
    return ok(out)

@api.post("/student/complaints")
@roles("student")
def create_student_complaint():
    s=student_for_user(); b=request.get_json() or {}
    try:
        d=pd(b.get("complaint_date"),True)
        subject=str(b.get("subject","")).strip()
        description=str(b.get("description","")).strip()
        mention_class=bool(b.get("mention_class"))
        class_id=b.get("class_id")
        if not subject:return err("Complaint subject is required")
        if not description:return err("Complaint description is required")
        selected_class=None
        if mention_class:
            try: class_id=int(class_id)
            except (TypeError,ValueError): return err("Please select the class you want to mention")
            assigned=StudentClass.query.filter_by(student_id=s.id,class_id=class_id,status="active").first()
            selected_class=Class.query.get(class_id)
            if not assigned or not selected_class or selected_class.status!="active":
                return err("You can only mention a class currently assigned to you",403)
        c=Complaint(student_id=s.id,class_id=(selected_class.id if selected_class else None),complaint_date=d,subject=subject,description=description,status="open")
        db.session.add(c); db.session.commit()
        return ok({"id":c.id},"Complaint submitted successfully",201)
    except ValueError:return err("Please enter a valid complaint date")
    except Exception:
        db.session.rollback();return err("Could not submit complaint")

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
    rows=FeeStructure.query.order_by(FeeStructure.effective_from.desc()).all()
    cids={f.class_id for f in rows}
    classes={c.id:c for c in Class.query.filter(Class.id.in_(cids)).all()} if cids else {}
    sids={c.subject_id for c in classes.values()}
    subjects={s.id:s for s in Subject.query.filter(Subject.id.in_(sids)).all()} if sids else {}
    out=[]
    for f in rows:
        c=classes.get(f.class_id);su=subjects.get(c.subject_id) if c else None
        out.append({"id":f.id,"class_id":f.class_id,"class_name":c.class_name if c else "","batch":c.batch if c else "","subject":su.name if su else "","monthly_fee":float(f.monthly_fee),"effective_from":f.effective_from.isoformat(),"effective_to":f.effective_to.isoformat() if f.effective_to else None,"status":f.status})
    return ok(out)
@api.post("/fee-structures")
@roles("admin")
def add_fee_structure():
    b=request.get_json(silent=True) or {}
    try:
        class_id=int(b.get("class_id"))
        effective_from=pd(b.get("effective_from"),True)
        effective_to=pd(b.get("effective_to"))
        monthly_fee=money(b.get("monthly_fee"))
        c=Class.query.get(class_id)
        if not c or c.status!="active":
            return err("Please select an active course/class",404)
        if effective_to and effective_to<effective_from:
            return err("Effective To cannot be before Effective From")

        # Only ACTIVE structures should prevent a new assignment. An inactive
        # record is historical data and must not block a new fee plan.
        existing=FeeStructure.query.filter(
            FeeStructure.class_id==class_id,
            FeeStructure.status=="active"
        ).all()
        new_end=effective_to or date.max
        for oldf in existing:
            old_end=oldf.effective_to or date.max
            if effective_from<=old_end and oldf.effective_from<=new_end:
                return err("An active fee structure already covers this course/class for the selected period. Edit it or choose a different period.",409)

        f=FeeStructure(
            class_id=class_id,
            monthly_fee=monthly_fee,
            effective_from=effective_from,
            effective_to=effective_to,
            created_by=current_user().id,
            status="active"
        )
        db.session.add(f)
        db.session.commit()
        return ok({"id":f.id,"class_id":f.class_id,"monthly_fee":float(f.monthly_fee),"effective_from":f.effective_from.isoformat(),"effective_to":f.effective_to.isoformat() if f.effective_to else None,"status":f.status},"Fee structure created and assigned to course/class",201)
    except (TypeError,ValueError,KeyError):
        db.session.rollback()
        return err("Please enter a valid course/class, monthly fee and effective date")
    except IntegrityError:
        db.session.rollback()
        return err("Could not save the fee structure. Check the selected course/class and try again.",409)
    except Exception:
        db.session.rollback()
        return err("Could not create the fee structure. Please try again.",500)

@api.put("/fee-structures/<int:id>")
@roles("admin")
def edit_fee_structure(id):
    f=FeeStructure.query.get(id)
    if not f:return err("Fee structure not found",404)
    b=request.get_json(silent=True) or {}
    try:
        class_id=int(b.get("class_id",f.class_id))
        effective_from=pd(b.get("effective_from",f.effective_from.isoformat()),True)
        effective_to=pd(b.get("effective_to",f.effective_to.isoformat() if f.effective_to else None))
        status=str(b.get("status",f.status)).strip().lower()
        monthly_fee=money(b.get("monthly_fee",f.monthly_fee))
        c=Class.query.get(class_id)
        if not c:
            return err("Selected course/class was not found",404)
        if status not in ("active","inactive"):
            return err("Invalid fee structure status")
        if effective_to and effective_to<effective_from:
            return err("Effective To cannot be before Effective From")
        if status=="active":
            if c.status!="active":
                return err("An active fee structure can only be assigned to an active course/class")
            new_end=effective_to or date.max
            for oldf in FeeStructure.query.filter(
                FeeStructure.class_id==class_id,
                FeeStructure.id!=id,
                FeeStructure.status=="active"
            ).all():
                old_end=oldf.effective_to or date.max
                if effective_from<=old_end and oldf.effective_from<=new_end:
                    return err("Another active fee structure overlaps this course/class for the selected period.",409)
        f.class_id=class_id
        f.monthly_fee=monthly_fee
        f.effective_from=effective_from
        f.effective_to=effective_to
        f.status=status
        db.session.commit()
        return ok({"id":f.id,"class_id":f.class_id,"monthly_fee":float(f.monthly_fee),"effective_from":f.effective_from.isoformat(),"effective_to":f.effective_to.isoformat() if f.effective_to else None,"status":f.status},"Fee structure updated")
    except (TypeError,ValueError,KeyError):
        db.session.rollback()
        return err("Please enter valid fee structure details")
    except IntegrityError:
        db.session.rollback()
        return err("Could not update the fee structure.",409)
    except Exception:
        db.session.rollback()
        return err("Could not update the fee structure. Please try again.",500)

@api.delete("/fee-structures/<int:id>")
@roles("admin")
def remove_fee_structure(id):
    f=FeeStructure.query.get(id)
    if not f:return err("Fee structure not found",404)
    if f.status!="inactive":
        return err("Only inactive fee structures can be deleted",409)
    try:
        audit(current_user().id,"delete","fee_structure",f.id,f"Deleted inactive fee structure for class {f.class_id}")
        db.session.delete(f)
        db.session.commit()
        return ok(message="Inactive fee structure deleted permanently")
    except Exception:
        db.session.rollback()
        return err("Could not delete fee structure",500)

def _fee_rows_for_student(sid):
    """Load the student's active fee structures once for all fee calculations."""
    assigned_ids={x.class_id for x in StudentClass.query.filter_by(student_id=sid,status="active").all()}
    if not assigned_ids:
        return []
    return (FeeStructure.query
        .filter(FeeStructure.class_id.in_(assigned_ids),FeeStructure.status=="active")
        .order_by(FeeStructure.class_id.asc(),FeeStructure.effective_from.desc(),FeeStructure.id.desc()).all())


def _fee_for_month_from_rows(rows, month):
    m=month.replace(day=1)
    latest={}
    for row in rows:
        if row.effective_from<=m and (row.effective_to is None or row.effective_to>=m):
            latest.setdefault(row.class_id,row)
    base=sum((Decimal(str(row.monthly_fee)) for row in latest.values()),Decimal("0.00"))
    # Late fee: every 15th that has passed while that month's fee remains unpaid
    # adds ₹50. Thus a ₹300 fee for January becomes ₹500 after April 15.
    today=today_ist()
    if base <= 0 or m > today.replace(day=1):
        return base
    months=(today.year-m.year)*12 + (today.month-m.month)
    penalty_cycles=months + (1 if today.day >= 15 else 0)
    return base + Decimal("50.00") * Decimal(max(0,penalty_cycles))


def oldest_due_month(sid):
    """Return the oldest unpaid month using one fee-structure query instead of one query per month."""
    student=Student.query.get(sid)
    if not student:
        return None,None
    today=today_ist().replace(day=1)
    rows=_fee_rows_for_student(sid)
    starts=[today]
    if student.admission_date: starts.append(student.admission_date.replace(day=1))
    starts.extend(r.effective_from.replace(day=1) for r in rows if r.effective_from)
    start=min(starts) if starts else today
    paid_months={p.fee_month.replace(day=1) for p in FeePayment.query.filter_by(student_id=sid).all()}
    m=start
    while m<=today:
        due=_fee_for_month_from_rows(rows,m)
        if due>0 and m not in paid_months:
            return m,due
        m=(m+timedelta(days=32)).replace(day=1)
    return None,None


def history(sid):
    rows=_fee_rows_for_student(sid)
    pay={p.fee_month:p for p in FeePayment.query.filter_by(student_id=sid).all()}
    m=today_ist().replace(day=1);out=[]
    for _ in range(12):
        due=_fee_for_month_from_rows(rows,m);p=pay.get(m)
        out.append({"month":m.strftime("%Y-%m"),"month_label":m.strftime("%B %Y"),"amount":float(p.amount if p else due),"due_amount":float(due),"status":"PAID" if p else ("DUE" if due else "N/A"),"payment_date":iso_ist(p.payment_date) if p else None,"receipt_number":p.receipt_number if p else None})
        m=(m-timedelta(days=1)).replace(day=1)
    return out

@api.get("/fees")
@roles("admin")
def fees():
    m=date.fromisoformat((request.args.get("month") or today_ist().strftime("%Y-%m"))+"-01");q=request.args.get("q","").lower();st=request.args.get("status","").upper();students=Student.query.filter_by(status="active").all()
    if q: students=[s for s in students if q in f"{s.student_id} {s.name} {s.phone or ''}".lower()]
    ids=[s.id for s in students]
    sc_rows=StudentClass.query.filter(StudentClass.student_id.in_(ids or [-1]),StudentClass.status=="active").all()
    fee_rows=(FeeStructure.query.join(StudentClass,StudentClass.class_id==FeeStructure.class_id).filter(StudentClass.student_id.in_(ids or [-1]),StudentClass.status=="active",FeeStructure.status=="active",FeeStructure.effective_from<=m).filter((FeeStructure.effective_to.is_(None))|(FeeStructure.effective_to>=m)).order_by(FeeStructure.class_id.asc(),FeeStructure.effective_from.desc(),FeeStructure.id.desc()).all())
    latest_by_class={}
    for f in fee_rows:latest_by_class.setdefault(f.class_id,f)
    class_ids={sid:set() for sid in ids}
    for sc in sc_rows:class_ids[sc.student_id].add(sc.class_id)
    payments={p.student_id:p for p in FeePayment.query.filter(FeePayment.student_id.in_(ids or [-1]),FeePayment.fee_month==m).all()}
    out=[]
    for s in students:
        due=_fee_for_month_from_rows([latest_by_class[cid] for cid in class_ids[s.id] if cid in latest_by_class],m);p=payments.get(s.id);status="PAID" if p else ("DUE" if due else "N/A")
        if st and st!=status:continue
        out.append({"student_id":s.id,"student_code":s.student_id,"student_name":s.name,"fee_month":m.strftime("%Y-%m"),"amount":float(p.amount if p else due),"status":status,"receipt_number":p.receipt_number if p else None})
    return ok(out)
@api.get("/fees/student/<int:id>")
@roles("admin","student")
def student_fees(id):
    s=Student.query.get(id);u=current_user()
    if not s:return err("Student not found",404)
    if u.role=="student" and s.user_id!=u.id:return err("Unauthorized",403)
    oldest_month,oldest_amount=oldest_due_month(s.id)
    return ok({
        "student":student_obj(s,private=u.role=="admin"),
        "current_monthly_fee":float(applicable_fee(s.id,today_ist().replace(day=1))),
        "oldest_due_month":oldest_month.strftime("%Y-%m") if oldest_month else None,
        "oldest_due_amount":float(oldest_amount) if oldest_amount is not None else 0,
        "history":history(s.id)
    })
@api.post("/fees/payment")
@roles("admin")
def pay_fee():
    b=request.get_json(silent=True) or {}
    try:
        sid=int(b.get("student_id")); s=Student.query.get(sid)
        if not s or s.status!="active": return err("Active student not found",404)
        oldest_month,oldest_amount=oldest_due_month(sid)
        requested_month=str(b.get("month") or "").strip()
        m=date.fromisoformat(requested_month+"-01")
        amount=money(b.get("amount"))
        method=str(b.get("payment_method") or "").strip().lower()
        if method not in ("cash","upi","bank_transfer","other"): return err("Please select a valid payment method")
        if oldest_month and m!=oldest_month:
            return err(f"Please collect the oldest due month first: {oldest_month.strftime('%B %Y')}",409)
        expected=applicable_fee(sid,m)
        if FeePayment.query.filter_by(student_id=sid,fee_month=m).first(): return err("Fee already paid for this month",409)
        if expected<=0: return err("No fee structure applies to this month")
        if amount!=expected: return err(f"Amount must equal ₹{expected:.2f}")
        rno=f"RCPT-{now_ist():%Y%m%d%H%M%S}-{__import__('secrets').token_hex(2).upper()}"
        p=FeePayment(student_id=sid,fee_month=m,amount=amount,payment_method=method,collected_by=current_user().id,receipt_number=rno,notes=str(b.get("notes") or "").strip() or None)
        db.session.add(p); db.session.flush()
        r=Receipt(fee_payment_id=p.id,receipt_number=rno); db.session.add(r)
        audit(current_user().id,"collect_fee","fee_payment",p.id,rno); db.session.commit()
        a=Admin.query.filter_by(user_id=current_user().id).first()
        sobj=student_obj(s)
        first=sobj["classes"][0] if sobj["classes"] else {}
        receipt_data={
            "receipt_number":rno,
            "student":s.name,
            "student_id":s.student_id,
            "class":first.get("class_name", ""),
            "teacher":first.get("teacher_name", ""),
            "fee_month":m.strftime("%B %Y"),
            "amount":float(p.amount),
            "payment_method":p.payment_method,
            "payment_date":iso_ist(p.payment_date),
            "collected_by":a.name if a else "Admin"
        }
        return ok({"id":p.id,"receipt_id":r.id,"receipt_number":rno,"receipt":receipt_data},"Fee payment recorded",201)
    except IntegrityError:db.session.rollback();return err("Duplicate payment",409)
    except Exception:
        db.session.rollback();return err("Invalid payment data")

@api.get("/receipts")
@roles("admin")
def receipts():
    q=request.args.get("q","").lower();rows=Receipt.query.order_by(Receipt.generated_at.desc()).all();payment_ids={r.fee_payment_id for r in rows}
    payments={p.id:p for p in FeePayment.query.filter(FeePayment.id.in_(payment_ids or [-1])).all()}
    student_ids={p.student_id for p in payments.values()};students={s.id:s for s in Student.query.filter(Student.id.in_(student_ids or [-1])).all()}
    out=[]
    for r in rows:
        p=payments.get(r.fee_payment_id);st=students.get(p.student_id) if p else None
        if not p or not st:continue
        if q and q not in f"{r.receipt_number} {st.student_id} {st.name}".lower():continue
        out.append({"id":r.id,"receipt_number":r.receipt_number,"student_name":st.name,"student_id":st.student_id,"month":p.fee_month.strftime("%B %Y"),"amount":float(p.amount),"method":p.payment_method,"generated_at":iso_ist(r.generated_at)})
    return ok(out)
@api.get("/receipts/<int:id>")
@roles("admin")
def receipt(id):
    r=Receipt.query.get(id)
    if not r:return err("Receipt not found",404)
    p=FeePayment.query.get(r.fee_payment_id)
    if not p:return err("Payment not found",404)
    s=Student.query.get(p.student_id);a=Admin.query.filter_by(user_id=p.collected_by).first();classes=student_obj(s)["classes"] if s else []
    first=classes[0] if classes else {}
    return ok({"receipt_number":r.receipt_number,"student":s.name if s else "","student_id":s.student_id if s else "","class":first.get("class_name", ""),"teacher":first.get("teacher_name", ""),"fee_month":p.fee_month.strftime("%B %Y"),"amount":float(p.amount),"payment_method":p.payment_method,"payment_date":iso_ist(p.payment_date),"collected_by":a.name if a else "Admin"})

def teacher_for_user():
    return Teacher.query.filter_by(user_id=current_user().id).first()
def student_for_user():
    return Student.query.filter_by(user_id=current_user().id).first()

@api.get("/teacher/dashboard")
@roles("teacher")
def teacher_dashboard():
    t=teacher_for_user();alloc=TeacherClass.query.filter_by(teacher_id=t.id,status="active").all();class_ids={a.class_id for a in alloc};ids={x.student_id for x in StudentClass.query.filter(StudentClass.class_id.in_(class_ids or [-1]),StudentClass.status=="active").all()};today=today_ist();classes={c.id:c for c in Class.query.filter(Class.id.in_(class_ids or [-1])).all()};class_data={x["id"]:x for x in _class_objs_bulk(classes.values())};recent=Classwork.query.filter_by(teacher_id=t.id).order_by(Classwork.work_date.desc()).limit(5).all()
    return ok({"teacher":teacher_obj(t),"total_students":len(ids),"total_classes":len(alloc),"todays_classes":[dict(class_data[a.class_id],start_time=a.start_time.strftime("%H:%M"),end_time=a.end_time.strftime("%H:%M")) for a in alloc if a.day_of_week==today.weekday() and a.class_id in class_data],"pending_homework":Homework.query.filter_by(teacher_id=t.id).filter(Homework.due_date>=today).count(),"recent_classwork":_classwork_objs_bulk(recent)})
@api.get("/teacher/students")
@roles("teacher")
def teacher_students():
    t=teacher_for_user();alloc=TeacherClass.query.filter_by(teacher_id=t.id,status="active").all();class_ids={a.class_id for a in alloc};student_ids={x.student_id for x in StudentClass.query.filter(StudentClass.class_id.in_(class_ids or [-1]),StudentClass.status=="active").all()};q=request.args.get("q","").lower();rows=Student.query.filter(Student.id.in_(student_ids or [-1])).order_by(Student.name).all();rows=[s for s in rows if not q or q in f"{s.name} {s.student_id}".lower()];return ok(_student_objs_bulk(rows,private=False))
def attendance_state(tc, now=None):
    now = now or datetime.now(ZoneInfo("Asia/Kolkata"))
    active = tc.day_of_week == now.weekday() and tc.start_time <= now.time() <= tc.end_time
    return {"active": active, "day_of_week": tc.day_of_week,
            "start_time": tc.start_time.strftime("%H:%M"),
            "end_time": tc.end_time.strftime("%H:%M")}

@api.get("/teacher/classes")
@roles("teacher")
def my_classes():
    t=teacher_for_user(); now=datetime.now(ZoneInfo("Asia/Kolkata"))
    allocations=TeacherClass.query.filter_by(teacher_id=t.id,status="active").all()
    class_ids=[a.class_id for a in allocations]
    classes={c.id:c for c in Class.query.filter(Class.id.in_(class_ids or [-1]),Class.status=="active").all()}
    items={x["id"]:x for x in _class_objs_bulk(classes.values())};out=[]
    for a in allocations:
        item=items.get(a.class_id)
        if not item:continue
        item=dict(item)
        effective=[x for x in _effective_class_schedule(classes[a.class_id],now.date(),1) if x.get("allocation_id")==a.id and x.get("teacher_id")==t.id]
        row=effective[0] if effective else None
        if row:
            active=row["start_time"] <= now.strftime("%H:%M") <= row["end_time"]
            item["attendance_active"]=active
            item["attendance_schedule"]={"day_of_week":now.weekday(),"start_time":row["start_time"],"end_time":row["end_time"]}
        else:
            item["attendance_active"]=False
            item["attendance_schedule"]={"day_of_week":now.weekday(),"start_time":None,"end_time":None}
        out.append(item)
    return ok(out)

@api.get("/teacher/classes/<int:class_id>/attendance")
@roles("teacher")
def get_attendance(class_id):
    """Return today's roster for marking attendance. Marks are kept in the browser
    until the teacher presses Submit Attendance."""
    t=teacher_for_user()
    now=datetime.now(ZoneInfo("Asia/Kolkata"))
    allocations=TeacherClass.query.filter_by(teacher_id=t.id,class_id=class_id,status="active").all()
    if not allocations:return err("Class not assigned to you",403)
    c=Class.query.get(class_id)
    if not c or c.status!="active":return err("Course not found",404)
    active_alloc=None
    for a in allocations:
        if any(x.get("allocation_id")==a.id and x.get("teacher_id")==t.id and x["start_time"] <= now.strftime("%H:%M") <= x["end_time"] for x in _effective_class_schedule(c,now.date(),1)):
            active_alloc=a;break
    students=(Student.query.join(StudentClass,StudentClass.student_id==Student.id)
              .filter(StudentClass.class_id==class_id,StudentClass.status=="active",Student.status=="active")
              .order_by(Student.name.asc()).all())
    records={x.student_id:x for x in Attendance.query.filter_by(class_id=class_id,attendance_date=now.date()).all()}
    return ok({"class_id":class_id,"active":bool(active_alloc),"date":now.date().isoformat(),
               "start_time":active_alloc.start_time.strftime("%H:%M") if active_alloc else None,
               "end_time":active_alloc.end_time.strftime("%H:%M") if active_alloc else None,
               "students":[{"id":s.id,"student_id":s.student_id,"name":s.name,
                            "status":records[s.id].status if s.id in records else None} for s in students]})

@api.post("/teacher/classes/<int:class_id>/attendance")
@roles("teacher")
def save_attendance(class_id):
    """Submit the complete attendance sheet in one transaction."""
    t=teacher_for_user()
    now=datetime.now(ZoneInfo("Asia/Kolkata"))
    c=Class.query.get(class_id)
    if not c or c.status!="active":return err("Course not found",404)
    allocation=None
    for a in TeacherClass.query.filter_by(teacher_id=t.id,class_id=class_id,status="active").all():
        if any(x.get("allocation_id")==a.id and x.get("teacher_id")==t.id and x["start_time"] <= now.strftime("%H:%M") <= x["end_time"] for x in _effective_class_schedule(c,now.date(),1)):
            allocation=a;break
    if not allocation:
        return err("Attendance can only be submitted during the scheduled class hours",403)

    b=request.get_json() or {}
    rows=b.get("attendance")
    if not isinstance(rows,list) or not rows:
        return err("Please mark attendance for all students before submitting")

    allowed={x.student_id for x in StudentClass.query.filter_by(
        class_id=class_id,status="active").all()}
    seen=set()
    try:
        for item in rows:
            student_id=int(item.get("student_id",0))
            status=str(item.get("status","")).lower()
            if student_id in seen:
                return err("Duplicate student in attendance")
            if student_id not in allowed:
                return err("Student is not allotted to this course",403)
            if status not in ("present","absent"):
                return err("Every student must be marked present or absent")
            seen.add(student_id)

        missing=allowed-seen
        if missing:
            return err("Please mark attendance for every student before submitting")

        for item in rows:
            student_id=int(item["student_id"])
            status=str(item["status"]).lower()
            rec=Attendance.query.filter_by(
                student_id=student_id,class_id=class_id,attendance_date=now.date()
            ).first()
            if rec:
                rec.status=status
                rec.marked_by=current_user().id
            else:
                db.session.add(Attendance(
                    student_id=student_id,class_id=class_id,
                    attendance_date=now.date(),status=status,
                    marked_by=current_user().id
                ))
        db.session.commit()
        return ok({"date":now.date().isoformat(),"count":len(rows)},
                  "Attendance submitted successfully")
    except Exception:
        db.session.rollback()
        return err("Could not submit attendance")

@api.get("/teacher/classes/<int:class_id>/attendance/history")
@roles("teacher")
def attendance_history(class_id):
    """Attendance history for a teacher's assigned course, optionally by date."""
    t=teacher_for_user()
    if not TeacherClass.query.filter_by(
        teacher_id=t.id,class_id=class_id,status="active").first():
        return err("Class not assigned to you",403)
    c=Class.query.get(class_id)
    if not c or c.status!="active":return err("Course not found",404)

    date_filter=request.args.get("date","").strip()
    from_date=request.args.get("from","").strip()
    to_date=request.args.get("to","").strip()

    query=Attendance.query.filter_by(class_id=class_id)
    try:
        if date_filter:
            query=query.filter(Attendance.attendance_date==date.fromisoformat(date_filter))
        elif from_date or to_date:
            if from_date: query=query.filter(Attendance.attendance_date>=date.fromisoformat(from_date))
            if to_date: query=query.filter(Attendance.attendance_date<=date.fromisoformat(to_date))
    except ValueError:
        return err("Invalid attendance date")

    records=query.order_by(Attendance.attendance_date.desc(),Attendance.student_id.asc()).all()
    student_ids={r.student_id for r in records}
    students={s.id:s for s in Student.query.filter(Student.id.in_(student_ids)).all()} if student_ids else {}

    grouped={}
    for r in records:
        key=r.attendance_date.isoformat()
        grouped.setdefault(key,[]).append({
            "student_id":students[r.student_id].student_id if r.student_id in students else "",
            "name":students[r.student_id].name if r.student_id in students else "Unknown",
            "status":r.status
        })
    days=[]
    for day,items in grouped.items():
        items.sort(key=lambda x:x["name"].lower())
        days.append({
            "date":day,
            "day":date.fromisoformat(day).strftime("%A"),
            "present":sum(1 for x in items if x["status"]=="present"),
            "absent":sum(1 for x in items if x["status"]=="absent"),
            "students":items
        })
    return ok({"class_id":class_id,"class_name":c.class_name,
               "batch":c.batch,"subject":(subject_obj(c.subject_id).name if subject_obj(c.subject_id) else ""),
               "history":days})

@api.get("/homework")
@roles("admin","teacher","student")
def get_homework():
    u=current_user();q=Homework.query
    if u.role=="teacher":q=q.filter_by(teacher_id=teacher_for_user().id)
    if u.role=="student":q=q.filter(Homework.class_id.in_([x.class_id for x in StudentClass.query.filter_by(student_id=student_for_user().id,status="active").all()] or [-1]))
    return ok(_homework_objs_bulk(q.order_by(Homework.homework_date.desc()).all()))
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
    return ok(_classwork_objs_bulk(q.order_by(Classwork.work_date.desc()).all()))
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
    s=student_for_user();x=student_obj(s,private=False);now=datetime.now(ZoneInfo("Asia/Kolkata"));today=now.date();month=today.replace(day=1)
    hw=[homework_obj(h) for h in Homework.query.filter(Homework.class_id.in_([c["class_id"] for c in x["classes"]] or [-1]),Homework.due_date>=today).order_by(Homework.due_date).limit(5).all()]
    paid=FeePayment.query.filter_by(student_id=s.id,fee_month=month).first();fee=applicable_fee(s.id,month)
    candidates=[]
    for c in x["classes"]:
        next_day=(c["day_of_week"]-now.weekday())%7
        start_dt=datetime.combine(today+timedelta(days=next_day),datetime.strptime(c["start_time"],"%H:%M").time(),tzinfo=now.tzinfo)
        if start_dt<=now:start_dt+=timedelta(days=7)
        candidates.append((start_dt,c))
    next_class=min(candidates,key=lambda z:z[0])[1] if candidates else None
    return ok({"student":x,"todays_classes":[c for c in x["classes"] if c["day_of_week"]==now.weekday()],"upcoming_homework":hw,"current_fee":{"amount":float(fee),"status":"PAID" if paid else ("DUE" if fee else "N/A")},"next_class":next_class})

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
    s=student_for_user();classes=student_obj(s,False)["classes"];teacher_codes={c["teacher_id"] for c in classes if c.get("teacher_id")};teachers={t.teacher_id:t for t in Teacher.query.filter(Teacher.teacher_id.in_(teacher_codes or ["__none__"])).all()};out=[];seen=set()
    for c in classes:
        tid=c.get("teacher_id")
        if tid and tid not in seen:
            t=teachers.get(tid)
            if t:out.append({"teacher_id":t.teacher_id,"name":t.name,"photo":t.photo,"subject":c["subject"],"qualification":t.qualification,"phone":t.phone,"email":t.email,"class_name":c["class_name"],"batch":c["batch"]});seen.add(tid)
    return ok(out)

@api.get("/audit-logs")
@roles("admin")
def audits():return ok([{"id":x.id,"action":x.action,"entity_type":x.entity_type,"entity_id":x.entity_id,"description":x.description,"created_at":iso_ist(x.created_at)} for x in AuditLog.query.order_by(AuditLog.created_at.desc()).limit(200).all()])
