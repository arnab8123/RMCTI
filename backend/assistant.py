
"""Zero-cost RMCTI admin assistant.

This is intentionally dependency-free: it uses deterministic intent/entity parsing
plus the existing database as its tool layer. No external AI API or API key is
required, and all mutations remain behind the normal admin JWT.
"""
import re
from difflib import SequenceMatcher
from datetime import date, datetime, timedelta, time
from decimal import Decimal

from sqlalchemy import or_, func

from .database import db
from .models import (
    Student, Teacher, Class, Subject, TeacherClass, StudentClass,
    Attendance, FeePayment, FeeStructure, ScheduleException, AuditLog, User
)
from .utils import today_ist, now_ist, hp, temp_pw, audit, DAYS, pd, pt


def _norm(s):
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def _has(text, *words):
    return any(w in text for w in words)


def _money(v):
    return f"₹{float(v):,.2f}"


def _parse_time(text):
    # 5pm, 5 pm, 17:30, 5:30 pm
    m = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", text, re.I)
    if not m:
        return None
    hour = int(m.group(1)); minute = int(m.group(2) or 0); ap = (m.group(3) or "").lower()
    if ap == "pm" and hour < 12: hour += 12
    if ap == "am" and hour == 12: hour = 0
    if hour > 23 or minute > 59: return None
    return time(hour, minute)


def _parse_date(text, default=None):
    base = default or today_ist()
    t = _norm(text)
    if "today" in t:
        return base
    if "tomorrow" in t:
        return base + timedelta(days=1)
    if "day after tomorrow" in t:
        return base + timedelta(days=2)
    for i, name in enumerate(DAYS):
        if re.search(r"\bnext\s+" + name.lower() + r"\b", t):
            delta = (i - base.weekday()) % 7
            delta = 7 if delta == 0 else delta
            return base + timedelta(days=delta)
        if re.search(r"\b" + name.lower() + r"\b", t):
            delta = (i - base.weekday()) % 7
            return base + timedelta(days=delta)
    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", t)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        y = int(m.group(3)) if m.group(3) else base.year
        if y < 100: y += 2000
        try: return date(y, mo, d)
        except ValueError: return None
    return None


def _parse_name_for_create(text, kind):
    t = str(text or "").strip()
    # Quoted names are the least ambiguous.
    q = re.search(r'["“](.+?)["”]', t)
    if q:
        return q.group(1).strip()
    patterns = [
        rf"(?:create|add|register)\s+(?:a\s+)?{kind}\s+(?:named\s+|called\s+)?(.+?)(?=\s+(?:with|phone|mobile|email|password|for|id)\b|$)",
        rf"{kind}\s+(?:named\s+|called\s+)(.+?)(?=\s+(?:with|phone|mobile|email|password)\b|$)",
    ]
    for p in patterns:
        m = re.search(p, t, re.I)
        if m:
            name = re.sub(r"\s+", " ", m.group(1)).strip(" ,.-")
            if name and len(name) <= 150:
                return name
    return None


def _parse_phone(text):
    m = re.search(r"(?:phone|mobile|contact)\s*(?:number)?\s*[:=-]?\s*(\+?\d[\d\s-]{7,16}\d)", text, re.I)
    return re.sub(r"[\s-]", "", m.group(1)) if m else None


def _parse_password(text):
    m = re.search(r"password\s*[:=-]?\s*([A-Za-z0-9@#$%^&*._-]{8,})", text, re.I)
    return m.group(1) if m else None


def _parse_id(text, prefix):
    m = re.search(rf"\b{prefix}[- ]?\d{{3,}}\b", text, re.I)
    return m.group(0).upper().replace(" ", "-") if m else None


def _class_label(c, subject_map):
    s = subject_map.get(c.subject_id)
    return f"{c.class_name} · {c.batch}" + (f" · {s.name}" if s else "")


def _class_candidates(text):
    classes = Class.query.filter_by(status="active").order_by(Class.class_name, Class.batch).all()
    if not classes:
        return []
    subject_map = {s.id: s for s in Subject.query.filter(
        Subject.id.in_({c.subject_id for c in classes})
    ).all()}
    teachers = {t.id: t for t in Teacher.query.filter_by(status="active").all()}
    q = _norm(text)
    scored = []
    for c in classes:
        parts = [c.class_name, c.batch, _class_label(c, subject_map)]
        parts += [t.name for tc in TeacherClass.query.filter_by(class_id=c.id, status="active").all()
                  for t in [teachers.get(tc.teacher_id)] if t]
        best = 0
        for part in parts:
            p = _norm(part)
            if p and p in q: best = max(best, 1.0)
            else:
                best = max(best, SequenceMatcher(None, p, q).ratio())
                for token in p.split():
                    if len(token) >= 3 and token in q:
                        best = max(best, 0.78)
        if best >= 0.52:
            scored.append((best, c))
    scored.sort(key=lambda x: (-x[0], x[1].id))
    return scored[:5]


def _today_classes():
    # Build directly from recurring allocations + schedule exceptions.
    from .routes import _effective_class_schedule_bulk, subject_obj
    classes = Class.query.filter_by(status="active").all()
    schedules = _effective_class_schedule_bulk(classes, today_ist(), 1)
    subject_map = {s.id: s for s in Subject.query.filter(
        Subject.id.in_({c.subject_id for c in classes} or {-1})
    ).all()}
    rows = []
    for c in classes:
        for x in schedules.get(c.id, []):
            rows.append({
                "class_id": c.id, "class_name": c.class_name, "batch": c.batch,
                "subject": subject_map.get(c.subject_id).name if subject_map.get(c.subject_id) else "",
                "teacher": x.get("teacher_name") or "Unassigned",
                "start": x.get("start_time") or "", "end": x.get("end_time") or "",
                "room": c.room or "", "kind": x.get("kind") or "regular"
            })
    rows.sort(key=lambda x: x["start"])
    return rows


def _fee_due():
    # Use the existing fee calculation route helper rather than duplicating fine logic.
    from .routes import _fee_month_balances_bulk
    students = Student.query.filter_by(status="active").order_by(Student.name).all()
    ids = [s.id for s in students]
    balances = _fee_month_balances_bulk(ids) if ids else {}
    month = today_ist().replace(day=1)
    out = []
    for s in students:
        rows = balances.get(s.id, [])
        due_rows = [x for x in rows if Decimal(str(x.get("balance", 0))) > 0]
        total_balance = sum((Decimal(str(x.get("balance", 0))) for x in due_rows), Decimal("0.00"))
        current = next((x for x in rows if x.get("month") == month), None)
        if total_balance > 0:
            out.append({"student_id": s.student_id, "name": s.name,
                        "balance": float(total_balance),
                        "current_balance": float(current.get("balance", 0)) if current else 0,
                        "status": current.get("status", "DUE") if current else "DUE"})
    return out


def _attendance_analytics():
    rows = Attendance.query.all()
    total = len(rows); present = sum(1 for r in rows if r.status == "present")
    absent = total - present
    pct = round(present / total * 100, 1) if total else 0
    return {"total": total, "present": present, "absent": absent, "percent": pct}


def _student_attendance(student):
    rows = Attendance.query.filter_by(student_id=student.id).all()
    total = len(rows); present = sum(1 for r in rows if r.status == "present")
    return {
        "student": student.name, "student_id": student.student_id,
        "total": total, "present": present, "absent": total-present,
        "percent": round(present / total * 100, 1) if total else 0
    }


def _find_student(text):
    sid = _parse_id(text, "STD")
    q = _norm(text)
    if sid:
        s = Student.query.filter_by(student_id=sid).first()
        if s: return s
    students = Student.query.filter_by(status="active").all()
    exact = [s for s in students if _norm(s.name) in q or _norm(s.student_id) in q]
    if exact: return exact[0]
    scored = sorted(((SequenceMatcher(None, _norm(s.name), q).ratio(), s) for s in students),
                    key=lambda x: -x[0])
    return scored[0][1] if scored and scored[0][0] >= 0.65 else None


def _find_teacher(text):
    tid = _parse_id(text, "TCH")
    q = _norm(text)
    if tid:
        t = Teacher.query.filter_by(teacher_id=tid).first()
        if t: return t
    teachers = Teacher.query.filter_by(status="active").all()
    exact = [t for t in teachers if _norm(t.name) in q or _norm(t.teacher_id) in q]
    if exact: return exact[0]
    scored = sorted(((SequenceMatcher(None, _norm(t.name), q).ratio(), t) for t in teachers),
                    key=lambda x: -x[0])
    return scored[0][1] if scored and scored[0][0] >= 0.68 else None


def _execute_create_student(text, user_id):
    name = _parse_name_for_create(text, "student")
    if not name:
        return {"reply": "Sure. What is the student's full name?", "needs_input": "student_name"}
    phone = _parse_phone(text)
    password = _parse_password(text) or temp_pw()
    if len(password) < 8:
        return {"reply": "The password must be at least 8 characters."}
    last = Student.query.order_by(Student.id.desc()).first()
    try: last_no = int(last.student_id.rsplit("-", 1)[-1]) if last and last.student_id.rsplit("-",1)[-1].isdigit() else Student.query.count()
    except Exception: last_no = Student.query.count()
    sid = f"STD-{last_no+1:05d}"
    if User.query.filter_by(username=sid).first():
        return {"reply": "I couldn't generate a unique student ID. Please try again."}
    if phone:
        existing = Student.query.filter_by(phone=phone, status="active").first()
        if existing:
            return {"reply": f"I found an active student with that phone number: {existing.name} ({existing.student_id})."}
    # Never create immediately from ambiguous free text without a confirmation.
    payload = {"type": "create_student", "name": name, "phone": phone, "password": password}
    return {"reply": f"I can create student **{name}** with ID **{sid}**"
                     + (f" and phone **{phone}**." if phone else ".")
                     + " Shall I create this student?",
            "confirm": True, "action": payload}


def _execute_create_teacher(text, user_id):
    name = _parse_name_for_create(text, "teacher")
    if not name:
        return {"reply": "Sure. What is the teacher's full name?", "needs_input": "teacher_name"}
    phone = _parse_phone(text)
    password = _parse_password(text) or temp_pw()
    if len(password) < 8:
        return {"reply": "The password must be at least 8 characters."}
    last = Teacher.query.order_by(Teacher.id.desc()).first()
    try: last_no = int(last.teacher_id.rsplit("-", 1)[-1]) if last and last.teacher_id.rsplit("-",1)[-1].isdigit() else Teacher.query.count()
    except Exception: last_no = Teacher.query.count()
    tid = f"TCH-{last_no+1:05d}"
    if User.query.filter_by(username=tid).first():
        return {"reply": "I couldn't generate a unique teacher ID. Please try again."}
    return {"reply": f"I can create teacher **{name}** with ID **{tid}**"
                     + (f" and phone **{phone}**." if phone else ".")
                     + " Shall I create this teacher?",
            "confirm": True,
            "action": {"type": "create_teacher", "name": name, "phone": phone, "password": password}}


def _execute_confirm(action, user_id):
    kind = action.get("type")
    if kind == "create_student":
        name = str(action.get("name") or "").strip()
        phone = action.get("phone")
        password = str(action.get("password") or "")
        last = Student.query.order_by(Student.id.desc()).first()
        try: last_no = int(last.student_id.rsplit("-",1)[-1]) if last and last.student_id.rsplit("-",1)[-1].isdigit() else Student.query.count()
        except Exception: last_no = Student.query.count()
        sid = f"STD-{last_no+1:05d}"
        u = User(username=sid, password_hash=hp(password), role="student", is_active=True)
        db.session.add(u); db.session.flush()
        s = Student(user_id=u.id, student_id=sid, name=name, phone=phone)
        db.session.add(s); db.session.flush()
        audit(user_id, "register", "student", s.id, sid)
        db.session.commit()
        return {"reply": f"✅ Student **{name}** created successfully. Student ID: **{sid}**. Temporary password: **{password}**."}
    if kind == "create_teacher":
        name = str(action.get("name") or "").strip()
        phone = action.get("phone")
        password = str(action.get("password") or "")
        last = Teacher.query.order_by(Teacher.id.desc()).first()
        try: last_no = int(last.teacher_id.rsplit("-",1)[-1]) if last and last.teacher_id.rsplit("-",1)[-1].isdigit() else Teacher.query.count()
        except Exception: last_no = Teacher.query.count()
        tid = f"TCH-{last_no+1:05d}"
        u = User(username=tid, password_hash=hp(password), role="teacher", is_active=True)
        db.session.add(u); db.session.flush()
        t = Teacher(user_id=u.id, teacher_id=tid, name=name, phone=phone)
        db.session.add(t); db.session.flush()
        audit(user_id, "register", "teacher", t.id, tid)
        db.session.commit()
        return {"reply": f"✅ Teacher **{name}** created successfully. Teacher ID: **{tid}**. Temporary password: **{password}**."}
    if kind == "delete_student":
        sid = int(action["student_id"])
        s = Student.query.get(sid)
        if not s:
            return {"reply": "That student no longer exists."}
        uid = s.user_id
        payment_ids = [x.id for x in FeePayment.query.filter_by(student_id=sid).all()]
        if payment_ids:
            from .models import Receipt
            Receipt.query.filter(Receipt.fee_payment_id.in_(payment_ids)).delete(synchronize_session=False)
            FeePayment.query.filter(FeePayment.id.in_(payment_ids)).delete(synchronize_session=False)
        StudentClass.query.filter_by(student_id=sid).delete(synchronize_session=False)
        Attendance.query.filter_by(student_id=sid).delete(synchronize_session=False)
        from .models import Complaint, NoticeAttachment
        Complaint.query.filter_by(student_id=sid).delete(synchronize_session=False)
        NoticeAttachment.query.filter_by(target_student_id=sid).update(
            {NoticeAttachment.target_student_id: None}, synchronize_session=False
        )
        audit(user_id, "delete", "student", sid, f"Deleted student {s.student_id} · {s.name}")
        db.session.delete(s)
        if uid:
            u = User.query.get(uid)
            if u: db.session.delete(u)
        db.session.commit()
        return {"reply": f"✅ Student **{action.get('name') or s.name}** was permanently deleted."}
    if kind == "assign_student":
        sid = int(action["student_id"]); cid = int(action["class_id"])
        s = Student.query.get(sid); c = Class.query.get(cid)
        if not s or not c or s.status != "active" or c.status != "active":
            return {"reply": "The student or course is no longer active."}
        existing = StudentClass.query.filter_by(student_id=sid, class_id=cid).first()
        if existing and existing.status == "active":
            return {"reply": f"**{s.name}** is already assigned to **{c.class_name} · {c.batch}**."}
        if StudentClass.query.filter_by(class_id=cid, status="active").count() >= c.max_students:
            return {"reply": "That course has reached its student capacity."}
        if existing:
            existing.status = "active"; existing.assigned_at = datetime.utcnow()
        else:
            db.session.add(StudentClass(student_id=sid, class_id=cid))
        audit(user_id, "assign", "student_class", None, f"{s.student_id} assigned to {c.class_name} · {c.batch}")
        db.session.commit()
        return {"reply": f"✅ **{s.name}** is now assigned to **{c.class_name} · {c.batch}**."}
    if kind == "reschedule":
        c = Class.query.get(int(action["class_id"]))
        tc = TeacherClass.query.get(int(action["allocation_id"]))
        if not c or not tc or c.status != "active" or tc.status != "active":
            return {"reply": "I couldn't find that active class schedule."}
        source = date.fromisoformat(action["source_date"])
        target = date.fromisoformat(action["target_date"])
        start = time.fromisoformat(action["start_time"])
        end = time.fromisoformat(action["end_time"])
        if target < today_ist():
            return {"reply": "I can't move a class to a date before today."}
        # Directly create the same exception type used by the schedule UI.
        ws = source - timedelta(days=source.weekday())
        # A same-day time change is represented as a reschedule to the same date.
        old = ScheduleException.query.filter_by(
            class_id=c.id, allocation_id=tc.id, schedule_date=source, kind="reschedule"
        ).first()
        if old: db.session.delete(old)
        ex = ScheduleException(
            class_id=c.id, allocation_id=tc.id, week_start=ws,
            schedule_date=source, target_date=target, start_time=start, end_time=end,
            teacher_id=tc.teacher_id, created_by=user_id, kind="reschedule"
        )
        db.session.add(ex)
        audit(user_id, "reschedule", "teacher_class", tc.id,
              f"{c.class_name}: occurrence moved from {source.isoformat()} to {target.isoformat()} {start.strftime('%H:%M')}-{end.strftime('%H:%M')}")
        db.session.commit()
        return {"reply": f"✅ Done. **{c.class_name} · {c.batch}** is scheduled for **{target.strftime('%A, %d %b')} {start.strftime('%H:%M')}–{end.strftime('%H:%M')}**."}
    return {"reply": "I don't have a safe action for that request yet."}


def assistant_handle(message, confirm_action=None, user_id=None):
    raw = str(message or "").strip()
    t = _norm(raw)
    if not t:
        return {"reply": "Hi! I’m the RMCTI admin assistant. Ask me about students, teachers, fees, attendance, classes, schedules, or ask me to make an admin change."}

    if confirm_action:
        if _has(t, "yes", "confirm", "do it", "go ahead", "create it", "okay", "ok"):
            try:
                return _execute_confirm(confirm_action, user_id)
            except Exception:
                db.session.rollback()
                return {"reply": "I couldn't complete that change. No change was saved."}
        if _has(t, "no", "cancel", "don't", "do not"):
            return {"reply": "Cancelled. I did not change anything."}
        return {"reply": "I have a pending change waiting for confirmation. Reply **yes** to apply it or **no** to cancel it.", "confirm": True, "action": confirm_action}

    # Greeting/help.
    if _has(t, "hello", "hi", "hey", "help", "what can you do"):
        return {"reply": "I can understand short admin keywords too. Try **classes today**, **fee due**, **attendance**, **attendance analytics**, **find Rahul**, **create student \"Rahul Das\"**, **create teacher \"Anita Roy\"**, or **reschedule the physics class tomorrow to 6 pm**."}

    # Create actions first, so "create student" doesn't get treated as a student search.
    if _has(t, "create student", "add student", "register student", "new student"):
        return _execute_create_student(raw, user_id)
    if _has(t, "create teacher", "add teacher", "register teacher", "new teacher"):
        return _execute_create_teacher(raw, user_id)

    # Today / schedule reads.
    if _has(t, "today", "classes today", "today's classes", "todays classes") and _has(t, "class", "classes", "schedule", "routine"):
        rows = _today_classes()
        if not rows:
            return {"reply": "There are no scheduled classes for today."}
        lines = [f"**{r['start']}–{r['end']}** · {r['class_name']} · {r['batch']} · {r['subject'] or 'No subject'} · {r['teacher']} · Room {r['room'] or '—'}" for r in rows]
        return {"reply": "### Today’s classes\n" + "\n".join(f"- {x}" for x in lines), "data": rows}

    # Fee due / outstanding.
    if _has(t, "fee", "fees", "due", "dues", "outstanding", "pending") and not _has(t, "fee structure"):
        rows = _fee_due()
        total = sum(x["balance"] for x in rows)
        if not rows:
            return {"reply": "No active student has a current-month fee balance due."}
        lines = [f"**{x['name']}** ({x['student_id']}) — {_money(x['balance'])} · {x['status']}" for x in rows[:50]]
        more = f"\n…and {len(rows)-50} more." if len(rows) > 50 else ""
        return {"reply": f"### Fee due\n**{len(rows)} students · {_money(total)} outstanding**\n" + "\n".join(f"- {x}" for x in lines) + more, "data": rows}

    # Attendance.
    if _has(t, "attendance", "attendence", "present", "absent"):
        student = _find_student(raw) if _has(t, "student", "for", "of", "name", "std-") else None
        if student:
            a = _student_attendance(student)
            return {"reply": f"### Attendance · {a['student']}\nPresent: **{a['present']}** · Absent: **{a['absent']}** · Attendance: **{a['percent']}%**", "data": a}
        a = _attendance_analytics()
        if _has(t, "analytics", "analysis", "percentage", "report", "performance", "overall", "summary"):
            return {"reply": f"### Attendance analytics\nPresent: **{a['present']}** · Absent: **{a['absent']}** · Total records: **{a['total']}** · Overall attendance: **{a['percent']}%**", "data": a}
        return {"reply": f"Attendance summary: **{a['percent']}%** overall ({a['present']} present, {a['absent']} absent across {a['total']} records). Ask `attendance Rahul` for a student's attendance or `attendance analytics` for the overall report.", "data": a}

    # Common admin mutations.
    if _has(t, "delete student", "remove student"):
        student = _find_student(raw)
        if not student:
            return {"reply": "Which student should I delete? Give the student's name or ID."}
        return {"reply": f"⚠️ This will permanently delete **{student.name} ({student.student_id})** and their fee, attendance, class-assignment and complaint records. Shall I continue?",
                "confirm": True, "action": {"type": "delete_student", "student_id": student.id, "name": student.name}}
    if _has(t, "assign student", "add student to class", "put student in class"):
        student = _find_student(raw)
        candidates = _class_candidates(raw)
        if not student:
            return {"reply": "Which student should I assign? Give the student's name or ID."}
        if not candidates:
            return {"reply": "Which course/class should I assign the student to?"}
        c = candidates[0][1]
        if len(candidates) > 1 and candidates[0][0] < 0.9:
            return {"reply": "I found multiple possible courses. Please include the course name or batch more clearly."}
        return {"reply": f"I can assign **{student.name}** to **{c.class_name} · {c.batch}**. Shall I do it?",
                "confirm": True, "action": {"type": "assign_student", "student_id": student.id, "class_id": c.id}}

    # Student / teacher search and counts.
    if _has(t, "student", "students"):
        sid = _parse_id(raw, "STD")
        s = _find_student(raw)
        if s:
            return {"reply": f"Student: **{s.name}** · ID **{s.student_id}** · Phone **{s.phone or '—'}** · Status **{s.status}**", "data": {"id":s.id,"student_id":s.student_id,"name":s.name,"phone":s.phone,"status":s.status}}
        count = Student.query.filter_by(status="active").count()
        return {"reply": f"RMCTI currently has **{count} active students**."}

    if _has(t, "teacher", "teachers"):
        tid = _parse_id(raw, "TCH")
        teacher = _find_teacher(raw)
        if teacher:
            return {"reply": f"Teacher: **{teacher.name}** · ID **{teacher.teacher_id}** · Phone **{teacher.phone or '—'}** · Status **{teacher.status}**", "data": {"id":teacher.id,"teacher_id":teacher.teacher_id,"name":teacher.name,"phone":teacher.phone,"status":teacher.status}}
        count = Teacher.query.filter_by(status="active").count()
        return {"reply": f"RMCTI currently has **{count} active teachers**."}

    # Reschedule / change-time mutation.
    if _has(t, "reschedule", "reschedule", "move class", "shift class", "change time", "change the time", "shift the class"):
        candidates = _class_candidates(raw)
        if not candidates:
            return {"reply": "Which class should I change? Tell me the course/class name, batch, subject, or teacher name."}
        if len(candidates) > 1 and candidates[0][0] < 0.9:
            opts = "\n".join(f"- **{c.class_name} · {c.batch}** (ID {c.id})" for _, c in candidates[:5])
            return {"reply": "I found multiple possible classes. Please tell me which one:\n" + opts}
        c = candidates[0][1]
        # "from Monday to Wednesday" supports a true reschedule. If only one
        # date is mentioned, treat it as the occurrence whose time is changing.
        source = None; target = None
        mfrom = re.search(r"\bfrom\s+(.+?)\s+to\s+", raw, re.I)
        mto = re.search(r"\bto\s+(.+?)(?=\s+(?:at|on)\b|\s*$)", raw, re.I)
        if mfrom:
            source = _parse_date(mfrom.group(1))
        if mfrom and mto:
            target = _parse_date(mto.group(1))
        if not source and not target:
            target = _parse_date(raw)
            source = target
        elif not target:
            target = source
        if not source or not target:
            return {"reply": f"What date should **{c.class_name} · {c.batch}** be moved from/to? You can say `today`, `tomorrow`, or `Monday`."}
        new_time = _parse_time(raw)
        if not new_time:
            return {"reply": "What new start time should I use? For example: **6 pm**."}
        from .routes import _effective_class_schedule
        occs = _effective_class_schedule(c, source, 1)
        occ = next((x for x in occs if x["date"] == source.isoformat()), None)
        if not occ:
            return {"reply": f"I couldn't find an active occurrence for **{c.class_name} · {c.batch}** on {source.strftime('%A, %d %b')}. Try `classes today` or specify the original date."}
        duration = timedelta(hours=1)
        allocation_id = occ.get("allocation_id")
        try:
            old_start = time.fromisoformat(occ["start_time"]); old_end = time.fromisoformat(occ["end_time"])
            duration = datetime.combine(source, old_end) - datetime.combine(source, old_start)
        except Exception:
            pass
        end_dt = datetime.combine(target, new_time) + duration
        end_time = end_dt.time()
        payload = {"type":"reschedule","class_id":c.id,"allocation_id":allocation_id,
                   "source_date":source.isoformat(),"target_date":target.isoformat(),
                   "start_time":new_time.strftime("%H:%M:%S"),"end_time":end_time.strftime("%H:%M:%S")}
        if source == target:
            wording = f"on **{source.strftime('%A, %d %b')}** to **{new_time.strftime('%H:%M')}–{end_time.strftime('%H:%M')}**"
        else:
            wording = f"from **{source.strftime('%A, %d %b')}** to **{target.strftime('%A, %d %b')} at {new_time.strftime('%H:%M')}–{end_time.strftime('%H:%M')}**"
        return {"reply": f"I’m ready to change **{c.class_name} · {c.batch}** {wording}. Shall I apply it?",
                "confirm": True, "action": payload}

    return {"reply": "I understood this as an RMCTI admin request, but I’m not sure which operation you mean. Try **classes today**, **fee due**, **attendance**, **attendance analytics**, **find <student>**, **create student \"Name\"**, or **reschedule <class> tomorrow to 6 pm**."}
