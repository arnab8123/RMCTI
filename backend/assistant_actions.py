"""Confirmation-required tools for the RMCTI AI assistant.

Each tool has two halves:
  prepare(ctx, args) -> Pending   validates everything and describes exactly what will happen;
  execute(ctx, args) -> dict      runs only after the admin presses Confirm in the chat.

Every database change still goes through the normal REST endpoints, so fee
rules, validation and audit logging are identical to the admin UI.
"""
from datetime import datetime, timedelta

from . import assistant_match as M
from .assistant_tools import (
    ToolError, Pending, risky_tool, S, N, B, L,
    find_student, find_teacher, find_course, course_label, _month_arg, _sched_text,
)

_METHODS = {
    "cash": "cash", "upi": "upi", "gpay": "upi", "google pay": "upi", "phonepe": "upi", "paytm": "upi",
    "online": "upi", "qr": "upi", "bank": "bank_transfer", "bank transfer": "bank_transfer", "neft": "bank_transfer",
    "imps": "bank_transfer", "rtgs": "bank_transfer", "cheque": "other", "check": "other", "card": "other",
}


def _method(value):
    key = str(value or "cash").strip().lower().replace("_", " ")
    return _METHODS.get(key, "other" if key not in ("", "cash") else "cash")


def _pretty_method(m):
    return m.replace("_", " ").title() if m != "upi" else "UPI"


# ==========================================================================
# FEE COLLECTION
# ==========================================================================
@risky_tool(
    "collect_fee", "Prepared fee payment",
    "Record a fee payment and/or discount (waiver) for a student. Payments always clear the OLDEST unpaid month "
    "first and spill over to later months. Use `amount` when the admin says how much was paid; "
    "`pay_full_month` for 'mark this month paid / paid in full'; `pay_all_dues` for 'clear all dues / mark "
    "everything paid'. `discount` is a waiver, not cash. The admin gets a Confirm button before anything is saved.",
    {"student": S("Student name or ID."), "amount": N("Cash actually received, in rupees."),
     "discount": N("Discount/waiver in rupees (optional)."),
     "pay_full_month": B("Pay the oldest unpaid month in full."), "pay_all_dues": B("Clear every unpaid month."),
     "payment_method": S("cash (default), upi, bank_transfer or other.", ["cash", "upi", "bank_transfer", "other"]),
     "notes": S("Optional note stored with the payment.")},
    ["student"])
def collect_fee(ctx, a):
    s = find_student(ctx, a.get("student"), need_active=True)
    info = ctx.fresh_get(f"/fees/student/{s['id']}") or {}
    owing = sorted((h for h in info.get("history") or [] if M.dec(h.get("due_amount")) > 0), key=lambda h: h["month"])
    if not owing:
        raise ToolError(f"{s['name']} has no outstanding fee, so there is nothing to collect.",
                        total_remaining=0, monthly_fee=info.get("current_monthly_fee"))
    mode = "all_dues" if a.get("pay_all_dues") else "full_month" if a.get("pay_full_month") else "amount"
    amount, discount = M.dec(a.get("amount")), M.dec(a.get("discount"))
    if amount < 0 or discount < 0:
        raise ToolError("Amounts can't be negative.")
    if mode == "amount" and amount <= 0 and discount <= 0:
        raise ToolError("How much did the student pay? Give an amount, or ask me to mark the month / all dues as paid.",
                        total_remaining=info.get("total_remaining"),
                        oldest_unpaid_month=M.fmt_month(owing[0]["month"]),
                        oldest_unpaid_balance=owing[0]["due_amount"])
    plan = M.plan_payments([{"month": h["month"], "balance": h["due_amount"]} for h in owing], amount, discount, mode)
    if plan["unallocated"] > 0:
        raise ToolError(f"That is {M.money(plan['unallocated'])} more than the total outstanding "
                        f"({M.money(plan['total_due'])}). Ask the admin to confirm the amount.",
                        total_remaining=plan["total_due"])
    if not plan["steps"]:
        raise ToolError("There is nothing to record for that request.")

    method = _method(a.get("payment_method"))
    by_month = {h["month"]: M.dec(h["due_amount"]) for h in owing}
    lines = [f"**Student:** {s['name']} · {s['student_id']}"]
    for st in plan["steps"]:
        bits = ([f"receive {M.money(st['amount'])}"] if st["amount"] > 0 else []) + \
               ([f"waive {M.money(st['discount'])}"] if st["discount"] > 0 else [])
        left = by_month[st["month"]] - st["amount"] - st["discount"]
        lines.append(f"**{M.fmt_month(st['month'])}:** {' and '.join(bits)}  (due {M.money(by_month[st['month']])} → {M.money(left)})")
    lines.append(f"**Method:** {_pretty_method(method)}")
    title = (f"Collect {M.money(plan['total_cash'])} from {s['name']}" if plan["total_cash"] > 0
             else f"Apply {M.money(plan['total_discount'])} discount for {s['name']}")
    args = {"student_id": s["id"], "student_name": s["name"], "student_code": s["student_id"], "mode": mode,
            "amount": str(amount), "discount": str(discount), "method": method,
            "notes": str(a.get("notes") or "").strip(),
            # Guard against double-clicks / stale cards: execution refuses if the balance moved.
            "expected_month": owing[0]["month"], "expected_balance": str(M.dec(owing[0]["due_amount"]))}
    return Pending(title, lines, args)


@collect_fee.executor
def collect_fee_exec(ctx, a):
    sid, name, code, mode = int(a["student_id"]), a["student_name"], a["student_code"], a["mode"]
    info = ctx.fresh_get(f"/fees/student/{sid}") or {}
    month, bal = info.get("oldest_due_month"), M.dec(info.get("oldest_due_amount"))
    if not month:
        return {"ok": False, "message": "Nothing is outstanding any more, so **no payment was recorded**."}
    if month != a["expected_month"] or bal != M.dec(a["expected_balance"]):
        return {"ok": False, "message": "The fee balance changed after this was prepared (a payment may already have "
                                        "been saved). **Nothing was recorded.** Ask me again to review the latest figures."}
    cash_left, disc_left = M.dec(a.get("amount")), M.dec(a.get("discount"))
    if mode in ("full_month", "all_dues"):
        cover = bal if mode == "full_month" else sum(
            (M.dec(h.get("due_amount")) for h in info.get("history") or [] if M.dec(h.get("due_amount")) > 0), M.dec(0))
        disc_left = min(disc_left, cover)
        cash_left = cover - disc_left

    done, failure = [], None
    for _ in range(36):
        month, bal = info.get("oldest_due_month"), M.dec(info.get("oldest_due_amount"))
        if not month or bal <= 0:
            break
        if mode == "all_dues":
            d = min(disc_left, bal)
            c = bal - d
        else:
            if cash_left <= 0 and disc_left <= 0:
                break
            d = min(disc_left, bal)
            c = min(cash_left, bal - d)
        if c + d <= 0:
            break
        try:
            data, _ = ctx.write("POST", "/fees/payment", {
                "student_id": sid, "month": month, "amount": float(c), "discount_amount": float(d),
                "payment_method": a["method"], "notes": a.get("notes") or None})
        except ToolError as e:
            failure = str(e)
            break
        done.append({"month": month, "cash": c, "discount": d, "receipt": data.get("receipt_number"),
                     "receipt_id": data.get("receipt_id"), "left": M.dec((data.get("receipt") or {}).get("remaining"))})
        cash_left -= c
        disc_left -= d
        if mode == "full_month":
            break
        info = ctx.fresh_get(f"/fees/student/{sid}") or {}

    if not done:
        return {"ok": False, "message": f"**No payment was recorded.** {failure or 'The fee system had nothing to apply.'}"}

    info = ctx.fresh_get(f"/fees/student/{sid}") or {}
    cash, disc = sum((x["cash"] for x in done), M.dec(0)), sum((x["discount"] for x in done), M.dec(0))
    out = [f"✅ **Payment recorded** for **{name}** ({code})", ""]
    for x in done:
        bits = ([f"received {M.money(x['cash'])}"] if x["cash"] > 0 else []) + \
               ([f"waived {M.money(x['discount'])}"] if x["discount"] > 0 else [])
        out.append(f"- **{M.fmt_month(x['month'])}** — {', '.join(bits)} · month balance {M.money(x['left'])} · receipt `{x['receipt']}`")
    out += ["", f"**Total received:** {M.money(cash)}" + (f" · **Discount:** {M.money(disc)}" if disc > 0 else "")
            + f" · **Still due overall:** {M.money(info.get('total_remaining'))}"]
    if failure:
        out += ["", f"⚠️ I stopped early: {failure} The payments listed above *were* saved."]
    elif mode == "amount" and cash_left > 0:
        out += ["", f"ℹ️ {M.money(cash_left)} was more than what was due, so it was not recorded."]
    return {"ok": True, "message": "\n".join(out), "total_received": float(cash), "total_discount": float(disc),
            "total_still_due": info.get("total_remaining"),
            "ui": [{"type": "receipt", "receipt_id": x["receipt_id"], "receipt_number": x["receipt"],
                    "month": M.fmt_month(x["month"]), "amount": float(x["cash"]), "student": name} for x in done]}


# ==========================================================================
# COURSE FEE
# ==========================================================================
def _fee_ops(structs, start, fee, class_id):
    """Decide the API calls needed to make `fee` apply from `start` onward without rewriting history."""
    structs = sorted(structs, key=lambda f: f["effective_from"])
    later = [f for f in structs if f["effective_from"] > start.isoformat()]
    if later:
        raise ToolError(f"A fee that starts on {M.fmt_date(later[0]['effective_from'])} already exists for this course, "
                        "after the month you asked for. Pick that month or later, or edit it on the Fee Structure page.")
    current = next((f for f in reversed(structs) if f["effective_from"] <= start.isoformat()
                    and (not f.get("effective_to") or f["effective_to"] >= start.isoformat())), None)
    new = {"class_id": class_id, "monthly_fee": float(fee), "effective_from": start.isoformat()}
    if current is None:
        return [("POST", "/fee-structures", new)], None, None
    old_fee = M.dec(current["monthly_fee"])
    if current["effective_from"] == start.isoformat():
        if old_fee == fee:
            raise ToolError(f"The fee is already {M.money(fee)} from {M.fmt_month(start)}.")
        return [("PUT", f"/fee-structures/{current['id']}", {"monthly_fee": float(fee)})], old_fee, None
    if old_fee == fee and not current.get("effective_to"):
        raise ToolError(f"The fee is already {M.money(fee)} (since {M.fmt_month(current['effective_from'])}).")
    if current.get("effective_to"):
        new["effective_to"] = current["effective_to"]
    close = {"effective_to": (start - timedelta(days=1)).isoformat()}
    undo = [f"/fee-structures/{current['id']}", {"effective_to": current.get("effective_to")}]
    return [("PUT", f"/fee-structures/{current['id']}", close), ("POST", "/fee-structures", new)], old_fee, undo


@risky_tool(
    "set_course_fee", "Prepared fee change",
    "Set or change a PAID course's monthly fee from a given month (default: the current month). Earlier months "
    "keep their old fee. Affects what every enrolled student owes from that month on, so it needs confirmation.",
    {"course": S("Course name/batch/subject."), "monthly_fee": N("New monthly fee in rupees."),
     "effective_from": S("Month it starts, YYYY-MM (default: current month).")},
    ["course", "monthly_fee"])
def set_course_fee(ctx, a):
    c = find_course(ctx, a.get("course"))
    if c.get("course_type") == "free":
        raise ToolError(f"{course_label(c)} is a free course, so it has no fee. Change it to a paid course first if needed.")
    fee = M.dec(a.get("monthly_fee"))
    if fee <= 0:
        raise ToolError("The monthly fee must be more than zero.")
    start = _month_arg(ctx, a.get("effective_from"))
    structs = [f for f in ctx.fresh_get("/fee-structures") or [] if f["class_id"] == c["id"] and f["status"] == "active"]
    ops, old_fee, undo = _fee_ops(structs, start, fee, c["id"])
    change = f"{M.money(old_fee)} → {M.money(fee)}" if old_fee is not None else f"{M.money(fee)} per month"
    lines = [f"**Course:** {course_label(c)}", f"**Monthly fee:** {change}, from **{M.fmt_month(start)}**",
             f"**Enrolled students affected:** {c.get('student_count', 0)}"]
    if old_fee is not None and ops[0][0] == "PUT" and "effective_to" in ops[0][2]:
        lines.append(f"Months before {M.fmt_month(start)} keep {M.money(old_fee)}.")
    return Pending(f"Set {course_label(c)} fee to {M.money(fee)}", lines,
                   {"ops": [[m, p, b] for m, p, b in ops], "course": course_label(c), "fee": str(fee),
                    "from": start.isoformat(), "undo": undo})


@set_course_fee.executor
def set_course_fee_exec(ctx, a):
    ops, undo = a["ops"], a.get("undo")
    for i, (method, path, body) in enumerate(ops):
        try:
            ctx.write(method, path, body)
        except ToolError as e:
            if i > 0 and undo:                       # restore the old structure if the second step failed
                try:
                    ctx.write("PUT", undo[0], undo[1])
                except ToolError:
                    pass
            return {"ok": False, "message": f"**The fee was not changed.** {e}"}
    return {"ok": True, "message": f"✅ **{a['course']}** now costs **{M.money(a['fee'])}** per month from "
                                   f"**{M.fmt_month(a['from'])}**."}


# ==========================================================================
# ENROLMENT / STAFFING
# ==========================================================================
@risky_tool(
    "remove_student_from_course", "Prepared removal",
    "Remove a student from a course (their record stays).",
    {"student": S("Student name or ID."), "course": S("Course name/batch/subject.")}, ["student", "course"])
def remove_student_from_course(ctx, a):
    s = find_student(ctx, a.get("student"))
    c = find_course(ctx, a.get("course"))
    enrolled = (ctx.get(f"/classes/{c['id']}") or {}).get("students", [])
    if not any(x["id"] == s["id"] for x in enrolled):
        raise ToolError(f"{s['name']} is not enrolled in {course_label(c)}.")
    return Pending(f"Remove {s['name']} from {course_label(c)}", [
        f"**Student:** {s['name']} · {s['student_id']}", f"**Course:** {course_label(c)}",
        "The fee system works out dues from a student's current courses, so this course's fee will also drop out of "
        "their earlier months."], {"student_id": s["id"], "class_id": c["id"], "student": s["name"], "course": course_label(c)})


@remove_student_from_course.executor
def remove_student_from_course_exec(ctx, a):
    ctx.write("DELETE", f"/classes/{a['class_id']}/students/{a['student_id']}")
    return {"ok": True, "message": f"✅ **{a['student']}** was removed from **{a['course']}**."}


@risky_tool(
    "unassign_teacher", "Prepared unassignment",
    "Remove a teacher from a course (all of their weekly slots on it).",
    {"teacher": S("Teacher name or ID."), "course": S("Course name/batch/subject.")}, ["teacher", "course"])
def unassign_teacher(ctx, a):
    t = find_teacher(ctx, a.get("teacher"))
    c = find_course(ctx, a.get("course"))
    slots = [al for al in c.get("allocations", []) if al.get("teacher_pk") == t["id"]]
    if not slots:
        raise ToolError(f"{t['name']} doesn't teach {course_label(c)}.")
    return Pending(f"Remove {t['name']} from {course_label(c)}", [
        f"**Teacher:** {t['name']} · {t['teacher_id']}", f"**Course:** {course_label(c)}",
        "**Weekly slots removed:** " + ", ".join(_sched_text(s) for s in slots)],
        {"allocation_ids": [s["allocation_id"] for s in slots], "teacher": t["name"], "course": course_label(c)})


@unassign_teacher.executor
def unassign_teacher_exec(ctx, a):
    for aid in a["allocation_ids"]:
        ctx.write("DELETE", f"/teacher-classes/{aid}")
    return {"ok": True, "message": f"✅ **{a['teacher']}** no longer teaches **{a['course']}**."}


# ==========================================================================
# DESTRUCTIVE
# ==========================================================================
@risky_tool(
    "delete_student", "Prepared deletion",
    "PERMANENTLY delete a student together with their fee payments, receipts, attendance and complaints. Only "
    "when the admin clearly says delete / permanently. For 'remove / unregister / deactivate' use "
    "set_student_status instead.",
    {"student": S("Student name or ID.")}, ["student"], danger=True)
def delete_student(ctx, a):
    s = find_student(ctx, a.get("student"))
    prof = ctx.get(f"/students/{s['id']}") or {}
    paid = (prof.get("fee_summary") or {}).get("total_paid") or 0
    lines = [f"**Student:** {s['name']} · {s['student_id']}",
             "Permanently deletes their login, class assignments, attendance, complaints and **all fee payments and "
             f"receipts** ({M.money(paid)} paid in total).", "**This cannot be undone.** To just stop them attending, "
             "deactivate them instead."]
    return Pending(f"Delete {s['name']} permanently", lines,
                   {"student_id": s["id"], "name": s["name"], "code": s["student_id"]}, danger=True,
                   confirm_label="Delete permanently")


@delete_student.executor
def delete_student_exec(ctx, a):
    ctx.write("DELETE", f"/students/{a['student_id']}")
    return {"ok": True, "message": f"✅ **{a['name']}** ({a['code']}) was permanently deleted."}


@risky_tool(
    "deactivate_teacher", "Prepared teacher removal",
    "Unregister a teacher: disables their login and removes them from all their weekly slots.",
    {"teacher": S("Teacher name or ID.")}, ["teacher"], danger=True)
def deactivate_teacher(ctx, a):
    t = find_teacher(ctx, a.get("teacher"), need_active=True)
    slots = t.get("classes") or []
    lines = [f"**Teacher:** {t['name']} · {t['teacher_id']}",
             "Their login is disabled and all of their weekly slots are removed."]
    if slots:
        lines.append("**Courses affected:** " + ", ".join(sorted({f"{x['class_name']} · {x['batch']}" for x in slots})))
    return Pending(f"Unregister {t['name']}", lines, {"teacher_id": t["id"], "name": t["name"], "code": t["teacher_id"]},
                   danger=True, confirm_label="Unregister")


@deactivate_teacher.executor
def deactivate_teacher_exec(ctx, a):
    ctx.write("DELETE", f"/teachers/{a['teacher_id']}")
    return {"ok": True, "message": f"✅ **{a['name']}** ({a['code']}) was unregistered."}


@risky_tool(
    "delete_course", "Prepared course deletion",
    "PERMANENTLY delete a course with its timetable, fee structures, homework, classwork and attendance.",
    {"course": S("Course name/batch/subject.")}, ["course"], danger=True)
def delete_course(ctx, a):
    c = find_course(ctx, a.get("course"))
    lines = [f"**Course:** {course_label(c)}", f"**Enrolled students:** {c.get('student_count', 0)}",
             "Permanently deletes its timetable, fee structures, homework, classwork and attendance records.",
             "**This cannot be undone.**"]
    return Pending(f"Delete {course_label(c)}", lines, {"class_id": c["id"], "course": course_label(c)},
                   danger=True, confirm_label="Delete permanently")


@delete_course.executor
def delete_course_exec(ctx, a):
    ctx.write("DELETE", f"/classes/{a['class_id']}")
    return {"ok": True, "message": f"✅ **{a['course']}** was permanently deleted."}


# ==========================================================================
# SCHEDULE CHANGES
# ==========================================================================
def _sessions_on(ctx, c, d):
    ws = M.week_start(d).isoformat()
    return [x for x in ctx.get(f"/classes/{c['id']}/schedule-week", week_start=ws) or []
            if x["date"] == d.isoformat() and x.get("allocation_id")]


@risky_tool(
    "change_schedule", "Prepared schedule change",
    "Change ONE session of a course in the current or a future week: `cancel` it, `move` it to another time or "
    "day within the same week, or add an `extra` session. Does not change the weekly timetable.",
    {"course": S("Course name/batch/subject."), "action": S("cancel, move or extra.", ["cancel", "move", "extra"]),
     "date": S("The session's current date YYYY-MM-DD (for extra: the date of the new session). Work out "
               "relative dates like 'tomorrow' yourself."),
     "new_date": S("move only: the new date YYYY-MM-DD (same week). Default: same date."),
     "start_time": S("move/extra: start time HH:MM (24h)."),
     "end_time": S("move/extra: end time HH:MM (24h). For move the original length is kept if omitted."),
     "teacher": S("extra: who teaches it (needed if the course has several teachers). Also picks the session "
                  "if two run on the same date."),
     "at_time": S("Original start time HH:MM, to pick the session if several run on that date.")},
    ["course", "action", "date"])
def change_schedule(ctx, a):
    c = find_course(ctx, a.get("course"))
    action = str(a.get("action") or "").lower()
    if action not in ("cancel", "move", "extra"):
        raise ToolError("The action must be cancel, move or extra.")
    d = M.parse_date(a.get("date"))
    if not d:
        raise ToolError(f"I couldn't read the date '{a.get('date')}'. Use YYYY-MM-DD.")
    if d < M.week_start(ctx.today):
        raise ToolError("Schedule changes can only be made for the current or a future week.")
    ws = M.week_start(d)
    when = f"{M.DAY_NAMES[d.weekday()]} {M.fmt_date(d)}"
    body = {"class_id": c["id"], "week_start": ws.isoformat()}

    if action == "extra":
        start, end = M.parse_time(a.get("start_time")), M.parse_time(a.get("end_time"))
        if not start or not end or start >= end:
            raise ToolError("An extra class needs a start time that is before its end time.")
        teachers = {al["teacher_pk"]: al["teacher_name"] for al in c.get("allocations", []) if al.get("teacher_pk")}
        if a.get("teacher"):
            t = find_teacher(ctx, a["teacher"], need_active=True)
        elif len(teachers) == 1:
            t = {"id": next(iter(teachers)), "name": next(iter(teachers.values()))}
        else:
            raise ToolError("Who should teach the extra class?", teachers=sorted(teachers.values()))
        body.update(kind="extra", schedule_date=d.isoformat(), start_time=start.strftime("%H:%M"),
                    end_time=end.strftime("%H:%M"), teacher_id=t["id"])
        lines = [f"**Add extra class:** {course_label(c)}", f"**When:** {when}, {M.fmt_time(start)}–{M.fmt_time(end)}",
                 f"**Teacher:** {t['name']}"]
        return Pending(f"Add extra class on {M.fmt_date(d)}", lines, {"body": body, "what": f"Extra class added for {course_label(c)} on {when}"})

    sessions = _sessions_on(ctx, c, d)
    if a.get("at_time"):
        at = M.parse_time(a["at_time"])
        sessions = [x for x in sessions if at and x["start_time"] == at.strftime("%H:%M")]
    if a.get("teacher"):
        sessions = [x for x in sessions if M.score(a["teacher"], [x.get("teacher_name") or ""]) >= 0.75]
    if not sessions:
        raise ToolError(f"{course_label(c)} has no session on {when}, so there is nothing to {action}.")
    if len(sessions) > 1:
        raise ToolError("Several sessions run that day. Ask the admin which one.",
                        sessions=[{"time": f"{M.fmt_time(x['start_time'])}–{M.fmt_time(x['end_time'])}",
                                   "teacher": x.get("teacher_name")} for x in sessions])
    x = sessions[0]
    old = f"{M.fmt_time(x['start_time'])}–{M.fmt_time(x['end_time'])}"
    body.update(allocation_id=x["allocation_id"], schedule_date=d.isoformat())

    if action == "cancel":
        body["kind"] = "delete"
        lines = [f"**Cancel:** {course_label(c)}", f"**Session:** {when}, {old} ({x.get('teacher_name') or '—'})"]
        return Pending(f"Cancel {course_label(c)} on {M.fmt_date(d)}", lines,
                       {"body": body, "what": f"{course_label(c)} on {when} was cancelled"}, danger=True,
                       confirm_label="Cancel the class")

    nd = M.parse_date(a.get("new_date")) if a.get("new_date") else d
    if not nd:
        raise ToolError(f"I couldn't read the new date '{a.get('new_date')}'. Use YYYY-MM-DD.")
    if M.week_start(nd) != ws:
        raise ToolError("A single session can only be moved within the same week (Monday–Sunday).")
    if nd < ctx.today:
        raise ToolError("The new date can't be in the past.")
    start = M.parse_time(a.get("start_time"))
    if not start:
        raise ToolError("What time should the session start? (HH:MM)")
    o_start, o_end = M.parse_time(x["start_time"]), M.parse_time(x["end_time"])
    end = M.parse_time(a.get("end_time"))
    if not end:
        end = (datetime.combine(nd, start) + (datetime.combine(d, o_end) - datetime.combine(d, o_start))).time()
    if start >= end:
        raise ToolError("The end time must be after the start time.")
    body.update(kind="weekly_time", target_date=nd.isoformat(), start_time=start.strftime("%H:%M"),
                end_time=end.strftime("%H:%M"))
    new_when = f"{M.DAY_NAMES[nd.weekday()]} {M.fmt_date(nd)}, {M.fmt_time(start)}–{M.fmt_time(end)}"
    lines = [f"**Move:** {course_label(c)}", f"**From:** {when}, {old}", f"**To:** {new_when}",
             "Only this week's session changes; the weekly timetable stays the same."]
    return Pending(f"Move {course_label(c)} to {M.fmt_date(nd)}", lines,
                   {"body": body, "what": f"{course_label(c)} moved from {when} to {new_when}"})


@change_schedule.executor
def change_schedule_exec(ctx, a):
    ctx.write("POST", "/schedule-exceptions", a["body"])
    return {"ok": True, "message": f"✅ {a['what']}."}
