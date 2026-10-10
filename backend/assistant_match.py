"""Pure helpers for the RMCTI AI assistant.

Nothing in this module touches Flask, the database or the network, so every
function here is cheap to unit-test (see tests/test_assistant_match.py).
"""
import re
import secrets
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from difflib import SequenceMatcher

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_DAY_ALIASES = {
    "mon": 0, "monday": 0, "tue": 1, "tues": 1, "tuesday": 1, "wed": 2, "wednesday": 2,
    "thu": 3, "thur": 3, "thurs": 3, "thursday": 3, "fri": 4, "friday": 4,
    "sat": 5, "saturday": 5, "sun": 6, "sunday": 6,
}
_MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
PAYMENT_METHODS = ("cash", "upi", "bank_transfer", "other")


# --------------------------------------------------------------------------
# Fuzzy name / ID resolution
# --------------------------------------------------------------------------
def norm(value):
    s = str(value or "").lower()
    s = re.sub(r"[.,\-_/'’\"()\[\]:;]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _compact(value):
    return re.sub(r"\s+", "", norm(value))


def _tok_eq(a, b):
    if a == b:
        return True
    if len(a) >= 3 and len(b) >= 3 and (b.startswith(a) or a.startswith(b)):
        return True
    return min(len(a), len(b)) >= 4 and SequenceMatcher(None, a, b).ratio() >= 0.8


def score(query, fuzzy=(), exact=()):
    """Score 0..1 of how well `query` identifies an item.

    fuzzy: free-text fields (names, course titles) - typos and partial words OK.
    exact: identifier-like fields (IDs, phone numbers) - only an exact or
           digit-contained match counts, never a "close" one, because a
           one-digit-different phone number or STD id is a *different* person.
    """
    q = norm(query)
    if not q:
        return 0.0
    qc = q.replace(" ", "")
    best = 0.0
    for e in exact:
        ec = _compact(e)
        if ec and ec == qc:
            return 1.0
        if ec and len(qc) >= 6 and qc.isdigit() and qc in ec:
            best = max(best, 0.9)
    qt = q.split()
    for f in fuzzy:
        n = norm(f)
        if not n:
            continue
        if q == n:
            return 1.0
        if qc == n.replace(" ", ""):
            return 0.99
        nt = n.split()
        cov = sum(1 for t in qt if any(_tok_eq(t, x) for x in nt)) / len(qt)
        s = 0.0
        if q in n:
            s = 0.9
        if cov == 1.0:
            s = max(s, 0.88)
        elif cov > 0:
            s = max(s, 0.5 * cov)
        s = max(s, SequenceMatcher(None, q, n).ratio() * 0.9)
        best = max(best, s)
    return best


def rank(query, items, fuzzy_fn, exact_fn=lambda it: (), minimum=0.6):
    scored = [(score(query, fuzzy_fn(it), exact_fn(it)), i, it) for i, it in enumerate(items)]
    scored = [x for x in scored if x[0] >= minimum]
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [(s, it) for s, _, it in scored]


def resolve(query, items, fuzzy_fn, exact_fn=lambda it: (), accept=0.75):
    """Return (status, picked, candidates); status is ok | ambiguous | none."""
    scored = [(score(query, fuzzy_fn(it), exact_fn(it)), i, it) for i, it in enumerate(items)]
    scored = [x for x in scored if x[0] > 0.3]
    scored.sort(key=lambda x: (-x[0], x[1]))
    if not scored:
        return "none", None, []
    top = scored[0][0]
    second = scored[1][0] if len(scored) > 1 else 0.0
    if top >= 0.99 and second < 0.99:
        return "ok", scored[0][2], []
    if top >= accept and (top - second) >= 0.1:
        return "ok", scored[0][2], []
    cands = [it for s, _, it in scored if s >= max(0.45, top - 0.3)][:6]
    return ("ambiguous" if top >= 0.6 else "none"), None, cands


# --------------------------------------------------------------------------
# Parsing helpers (the model is told to send ISO dates, but be forgiving)
# --------------------------------------------------------------------------
def parse_date(value):
    s = str(value or "").strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        pass
    m = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y += 2000 if y < 100 else 0
        try:
            return date(y, mo, d)
        except ValueError:
            return None
    return None


def parse_time(value):
    s = str(value or "").strip().lower().replace(".", "")
    m = re.match(r"^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$", s)
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    if h > 23 or mi > 59:
        return None
    return time(h, mi)


def parse_month(value):
    """Return the first day of a month from YYYY-MM, YYYY-MM-DD, 'Oct 2026', etc."""
    s = str(value or "").strip().lower()
    if not s:
        return None
    m = re.match(r"^(\d{4})-(\d{1,2})(?:-\d{1,2})?$", s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), 1)
        except ValueError:
            return None
    m = re.match(r"^([a-z]{3,9})\.?,?\s+(\d{4})$", s)
    if m and m.group(1)[:3] in _MONTHS:
        return date(int(m.group(2)), _MONTHS[m.group(1)[:3]], 1)
    return None


def parse_weekday(value):
    if isinstance(value, (int, float)):
        i = int(value)
        return i if 0 <= i <= 6 else None
    return _DAY_ALIASES.get(str(value or "").strip().lower().rstrip("."))


def as_list(value):
    if value is None or value == "":
        return []
    if isinstance(value, (list, tuple)):
        return [x for x in value if x not in (None, "")]
    return [x.strip() for x in re.split(r"[,;&]|\band\b", str(value)) if x.strip()]


def week_start(d):
    return d - timedelta(days=d.weekday())


def temp_password(n=10):
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(n))


# --------------------------------------------------------------------------
# Formatting
# --------------------------------------------------------------------------
def dec(value):
    return Decimal(str(value if value not in (None, "") else 0)).quantize(Decimal("0.01"), ROUND_HALF_UP)


def money(value):
    d = dec(value)
    whole, frac = f"{abs(d):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        whole = f"{head},{tail}"
    sign = "-" if d < 0 else ""
    return f"{sign}₹{whole}" if frac == "00" else f"{sign}₹{whole}.{frac}"


def fmt_date(value):
    d = value if isinstance(value, date) else parse_date(value)
    return d.strftime("%d/%m/%Y") if d else str(value or "—")


def fmt_month(value):
    d = value if isinstance(value, date) else parse_month(value)
    return d.strftime("%B %Y") if d else str(value or "—")


def fmt_time(value):
    t = value if isinstance(value, time) else parse_time(value)
    return t.strftime("%I:%M %p").lstrip("0") if t else str(value or "—")


# --------------------------------------------------------------------------
# Fee planning
# --------------------------------------------------------------------------
def plan_payments(months, amount=None, discount=None, mode="amount"):
    """Preview how a payment is spread over outstanding months, oldest first.

    months: [{"month": "2026-09", "balance": 800}, ...] (any order; zero or
            negative balances are ignored).
    mode:   "amount"     - use the given amount (+ optional discount)
            "full_month" - clear only the oldest outstanding month
            "all_dues"   - clear every outstanding month
    Returns {"steps": [{"month", "amount", "discount"}], "total_cash",
    "total_discount", "unallocated", "total_due"}.

    The live payment loop in assistant_tools re-reads the real balances after
    every payment (late fines can change), so this is a faithful preview, not
    the executor.
    """
    due = sorted(({"month": m["month"], "balance": dec(m["balance"])}
                  for m in months if dec(m.get("balance")) > 0), key=lambda m: m["month"])
    total_due = sum((m["balance"] for m in due), Decimal("0.00"))
    disc_left = max(dec(discount), Decimal("0.00"))
    if mode == "full_month":
        due = due[:1]
    if mode in ("full_month", "all_dues"):
        cover = sum((m["balance"] for m in due), Decimal("0.00"))
        disc_left = min(disc_left, cover)
        cash_left = cover - disc_left
    else:
        cash_left = max(dec(amount), Decimal("0.00"))
    steps = []
    for m in due:
        if cash_left <= 0 and disc_left <= 0:
            break
        d = min(disc_left, m["balance"])
        a = min(cash_left, m["balance"] - d)
        if a + d <= 0:
            continue
        steps.append({"month": m["month"], "amount": a, "discount": d})
        disc_left -= d
        cash_left -= a
    return {
        "steps": steps,
        "total_cash": sum((s["amount"] for s in steps), Decimal("0.00")),
        "total_discount": sum((s["discount"] for s in steps), Decimal("0.00")),
        "unallocated": cash_left + disc_left,
        "total_due": total_due,
    }
