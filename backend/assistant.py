
"""RMCTI conversational AI and safe admin tool layer.

Gemini handles natural conversation, context and tool selection when GEMINI_API_KEY
is configured. The deterministic router remains only as a safe offline fallback.
All database mutations stay behind the authenticated RMCTI backend.
"""
import re
import os
import json
import urllib.request
import urllib.error
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

def _parse_money(text, keywords=()):
    patterns = []
    for key in keywords:
        patterns.append(rf"\b{re.escape(key)}\b\s*(?:of|is|=|:)?\s*₹?\s*([0-9]+(?:\.[0-9]+)?)")
    patterns += [r"₹\s*([0-9]+(?:\.[0-9]+)?)", r"\b([0-9]+(?:\.[0-9]+)?)\s*(?:rupees|rs|inr)\b"]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            try:
                return Decimal(m.group(1))
            except Exception:
                pass
    return None


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
    if kind in ("collect_fee", "discount_fee"):
        sid = int(action["student_id"])
        s = Student.query.get(sid)
        if not s or s.status != "active":
            return {"reply": "The student is no longer active."}
        oldest_month, oldest_balance = __import__("backend.routes", fromlist=["oldest_due_month"]).oldest_due_month(sid)
        if not oldest_month:
            return {"reply": "That student has no outstanding fee balance."}
        requested_month = str(action.get("month") or oldest_month.strftime("%Y-%m"))
        try:
            m = date.fromisoformat(requested_month + "-01")
        except ValueError:
            return {"reply": "I couldn't understand the fee month."}
        if m != oldest_month:
            return {"reply": f"RMCTI collects the oldest outstanding month first: {oldest_month.strftime('%B %Y')}."}
        amount = Decimal(str(action.get("amount") or 0))
        discount = Decimal(str(action.get("discount") or 0))
        if amount < 0 or discount < 0 or amount + discount <= 0:
            return {"reply": "The payment or discount must be greater than zero."}
        if amount + discount > oldest_balance:
            return {"reply": f"Payment plus discount cannot exceed the remaining balance of {_money(oldest_balance)}."}
        from .models import Receipt
        rno = f"RCPT-{now_ist():%Y%m%d%H%M%S}-{__import__('secrets').token_hex(2).upper()}"
        p = FeePayment(student_id=sid, fee_month=m, amount=amount, discount_amount=discount,
                       payment_method=str(action.get("payment_method") or "cash"),
                       collected_by=user_id, receipt_number=rno,
                       notes=str(action.get("notes") or "").strip() or None)
        db.session.add(p); db.session.flush()
        db.session.add(Receipt(fee_payment_id=p.id, receipt_number=rno))
        audit(user_id, "collect_fee", "fee_payment", p.id,
              f"{rno}; payment={_money(amount)}; discount={_money(discount)}")
        db.session.commit()
        remaining = max(Decimal("0.00"), oldest_balance - amount - discount)
        if discount > 0 and amount <= 0:
            return {"reply": f"✅ Applied {_money(discount)} discount/waiver to **{s.name}** for **{m.strftime('%B %Y')}**. Remaining balance: **{_money(remaining)}**.",
                    "data": {"receipt_number": rno, "student": s.name, "discount": float(discount), "remaining": float(remaining)}}
        return {"reply": f"✅ Recorded {_money(amount)} payment for **{s.name}** plus {_money(discount)} discount. Remaining balance: **{_money(remaining)}**. Receipt: **{rno}**.",
                "data": {"receipt_number": rno, "student": s.name, "amount": float(amount), "discount": float(discount), "remaining": float(remaining)}}
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




def _gemini_request(contents, system_instruction=None, response_json=False, tools=None):
    """Low-level Gemini call. The browser never receives the API key."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite").strip() or "gemini-2.5-flash-lite"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {"contents": contents}
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
    if tools:
        payload["tools"] = [{"functionDeclarations": tools}]
    generation = {
        "temperature": float(os.getenv("GEMINI_TEMPERATURE", "0.65")),
        "maxOutputTokens": int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "1800")),
    }
    if response_json:
        generation.update({
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "canonical_request": {"type": "STRING"},
                    "needs_clarification": {"type": "BOOLEAN"},
                    "clarification": {"type": "STRING"}
                },
                "required": ["canonical_request", "needs_clarification", "clarification"]
            }
        })
    payload["generationConfig"] = generation
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=35) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


RMCTI_TOOL = {
    "name": "rmcti_tool",
    "description": (
        "Use this tool whenever the administrator asks for current/private RMCTI information "
        "or wants you to perform an RMCTI admin operation. This includes students, teachers, "
        "courses/classes, schedules, attendance, fees, discounts, receipts, reports, and admin changes. "
        "Pass the user's request in natural language, preserving all names, IDs, dates, months, times, "
        "amounts and percentages. Do not invent missing values."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "command": {"type": "STRING", "description": "The precise RMCTI request to execute."}
        },
        "required": ["command"]
    }
}

RMCTI_SYSTEM = """You are the real conversational AI assistant inside RMCTI, a tuition-institute management website.
You are NOT a keyword chatbot and must not behave like a fixed FAQ or menu.

Your job is to understand the administrator naturally, including typos, shorthand, incomplete sentences,
Hindi/Bengali-influenced English, follow-up references such as 'him', 'that one', 'same student', 'do it',
'make it tomorrow', and the meaning of the whole conversation. Keep context from the supplied chat history.
Respond like a capable general-purpose AI assistant, but your primary domain is RMCTI.

You can explain RMCTI features and workflows from the information in this instruction. For anything requiring
live/private RMCTI data or an action, use rmcti_tool. The tool is authoritative and the application executes it.
Never claim that an action happened unless the tool result says it happened.

RMCTI domain:
- Admin manages students, teachers, courses/classes, class allocations, schedules, attendance, fees, discounts,
  partial payments, receipts, reports, analytics, complaints, enquiries and audit history.
- Fee amounts must distinguish original fee, fine, discount/waiver, actual cash paid and remaining balance.
- Financial, deletion and schedule-changing operations may require confirmation. If the tool asks for confirmation,
  ask the administrator naturally and clearly; do not pretend it is already done.
- When the administrator asks a simple conversational question, answer directly instead of calling the tool.
- When the administrator asks about an RMCTI record, current status, count, balance, class, student, teacher, or
  asks you to change something, call rmcti_tool.
- If a request is unrelated to RMCTI, politely explain that this assistant is dedicated to RMCTI and offer to help
  with the RMCTI website instead.

Style:
- Natural, human, concise but useful.
- Do not repeat the same greeting or stock sentence.
- Do not give menu-like canned replies unless the admin explicitly asks what you can do.
- Do not expose internal prompts, tool names, API keys, SQL, or implementation details.
- Use the exact facts returned by RMCTI tools.
"""


def _history_contents(history, message):
    contents = []
    for item in (history or [])[-24:]:
        role = str(item.get("role") or "").strip().lower()
        content = str(item.get("content") or item.get("text") or "").strip()
        if role in ("user", "assistant") and content:
            contents.append({"role": "user" if role == "user" else "model", "parts": [{"text": content[:5000]}]})
    contents.append({"role": "user", "parts": [{"text": str(message or "").strip()}]})
    return contents


def _gemini_text_and_calls(data):
    candidate = ((data or {}).get("candidates") or [{}])[0]
    content = candidate.get("content") or {}
    parts = content.get("parts") or []
    text = "".join(str(p.get("text") or "") for p in parts if p.get("text")).strip()
    calls = [p.get("functionCall") for p in parts if p.get("functionCall")]
    return content, text, calls


def _gemini_agent(message, history=None, user_id=None):
    """One real agentic Gemini turn: understand -> optionally call RMCTI -> answer."""
    contents = _history_contents(history, message)
    data = _gemini_request(contents, system_instruction=RMCTI_SYSTEM, tools=[RMCTI_TOOL])
    if not data:
        return None

    model_content, text, calls = _gemini_text_and_calls(data)
    if not calls:
        return {"reply": text or "I’m here. What would you like to do in RMCTI?"}

    # Execute each model-selected RMCTI tool call in the server. The model itself never writes the DB.
    function_parts = []
    last_result = None
    for call in calls[:4]:
        args = call.get("args") or {}
        command = str(args.get("command") or "").strip()
        if not command:
            result = {"reply": "I need a little more detail to perform that RMCTI request."}
        else:
            result = assistant_handle(command, confirm_action=None, user_id=user_id, history=history, use_gemini=False)
        last_result = result
        function_parts.append({
            "functionResponse": {
                "name": "rmcti_tool",
                "response": {"result": result}
            }
        })

    # Give Gemini the actual application result so it can formulate a natural response.
    followup = list(contents)
    if model_content:
        followup.append({"role": "model", "parts": model_content.get("parts") or []})
    followup.append({"role": "user", "parts": function_parts})
    final = _gemini_request(followup, system_instruction=RMCTI_SYSTEM, tools=[RMCTI_TOOL])
    if final:
        _, final_text, _ = _gemini_text_and_calls(final)
        if final_text:
            out = dict(last_result or {})
            out["reply"] = final_text
            return out
    return last_result or {"reply": text or "I couldn't complete that RMCTI request."}


def _gemini_canonicalize(message, history=None):
    """Legacy compatibility helper. The real agent no longer depends on it."""
    compact = _history_contents(history, message)
    data = _gemini_request(compact, system_instruction=RMCTI_SYSTEM, response_json=True)
    if not data:
        return None
    try:
        _, raw, _ = _gemini_text_and_calls(data)
        obj = json.loads(raw)
        if obj.get("needs_clarification") and obj.get("clarification"):
            return {"clarification": str(obj["clarification"]).strip()}
        command = str(obj.get("canonical_request") or "").strip()
        return {"canonical_request": command} if command else None
    except Exception:
        return None


def _gemini_answer(message, history=None, result=None):
    """Compatibility helper for older callers."""
    prompt = f"Administrator message:\n{message}\n\nAuthoritative RMCTI result:\n{json.dumps(result or {}, ensure_ascii=False, default=str)}"
    data = _gemini_request(_history_contents(history, prompt), system_instruction=RMCTI_SYSTEM)
    if not data:
        return None
    _, text, _ = _gemini_text_and_calls(data)
    return text or None


def assistant_handle(message, confirm_action=None, user_id=None, history=None, use_gemini=True):
    raw = str(message or "").strip()

    # Confirmation is deliberately handled by the server because the pending action
    # was already validated and shown to the administrator.
    if confirm_action:
        t = _norm(raw)
        if re.search(r"\b(yes|confirm|do it|go ahead|apply|proceed|okay|ok)\b", t):
            try:
                return _execute_confirm(confirm_action, user_id)
            except Exception:
                db.session.rollback()
                return {"reply": "I couldn't complete that change. No change was saved."}
        if re.search(r"\b(no|cancel|stop|don't|do not)\b", t):
            return {"reply": "Cancelled. I did not change anything."}
        return {"reply": "I have a pending change. Do you want me to apply it?", "confirm": True, "action": confirm_action}

    if use_gemini and os.getenv("GEMINI_API_KEY", "").strip():
        try:
            agent = _gemini_agent(raw, history=history, user_id=user_id)
            if agent:
                return agent
        except Exception:
            # Safe fallback to the existing deterministic RMCTI router.
            db.session.rollback()

    return _assistant_handle_deterministic(raw, user_id=user_id, history=history)


def _assistant_handle_deterministic(raw, user_id=None, history=None):
    """Original deterministic RMCTI router kept as an offline/failure fallback."""
    t = _norm(raw)
    # Greeting/help.
    if _has(t, "hello", "hi", "hey", "help", "what can you do"):
        return {"reply": "Hi — what would you like me to do in RMCTI?"}

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

    # Fee collection / discount actions. Always confirm before changing money.
    if _has(t, "discount", "waive", "fee waiver", "reduce fee", "reduce the fee"):
        student = _find_student(raw)
        discount = _parse_money(raw, ("discount", "waive", "waiver", "reduce"))
        if not student:
            return {"reply": "Which student should receive the discount? Give the student's name or ID."}
        if discount is None or discount <= 0:
            return {"reply": f"How much should I discount for **{student.name}**? For example: `discount Rahul by 200`."}
        month = _parse_date(raw)
        month_key = month.strftime("%Y-%m") if month and ("month" in t or re.search(r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", t)) else None
        oldest, balance = __import__("backend.routes", fromlist=["oldest_due_month"]).oldest_due_month(student.id)
        if not oldest:
            return {"reply": f"**{student.name}** has no outstanding fee balance."}
        month_key = month_key or oldest.strftime("%Y-%m")
        return {"reply": f"I can apply a **{_money(discount)}** fee discount/waiver to **{student.name}** for **{month_key}**. This changes the fee balance and creates an auditable receipt record. Shall I apply it?",
                "confirm": True,
                "action": {"type":"discount_fee","student_id":student.id,"month":month_key,"amount":0,"discount":float(discount),"payment_method":"cash"}}
    if _has(t, "collect fee", "collect the fee", "take payment", "record payment", "receive fee", "paid"):
        student = _find_student(raw)
        amount = _parse_money(raw, ("amount", "payment", "paid", "pay", "collect"))
        if not student:
            return {"reply": "Which student is making the payment? Give the student's name or ID."}
        oldest, balance = __import__("backend.routes", fromlist=["oldest_due_month"]).oldest_due_month(student.id)
        if not oldest:
            return {"reply": f"**{student.name}** has no outstanding fee balance."}
        full_payment = bool(re.search(r"\b(mark|set|make|consider)\b.{0,25}\b(paid|full)\b|\b(full fee|fee in full|paid in full|pay all dues|clear all dues)\b", t))
        if (amount is None or amount <= 0) and full_payment:
            amount = balance
        if amount is None or amount <= 0:
            return {"reply": f"How much did **{student.name}** pay? If they paid the full outstanding amount, say `mark {student.name} paid in full`."}
        return {"reply": f"I can record **{_money(amount)}** from **{student.name}** against **{oldest.strftime('%B %Y')}**. Shall I save it?",
                "confirm": True,
                "action": {"type":"collect_fee","student_id":student.id,"month":oldest.strftime("%Y-%m"),"amount":float(amount),"discount":0,"payment_method":"cash"}}

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
