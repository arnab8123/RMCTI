from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity
from .models import User, TokenBlocklist


def current_user():
    identity = get_jwt_identity()
    if not identity:
        return None
    try:
        return User.query.get(int(identity))
    except (TypeError, ValueError):
        return None


def roles(*allowed):
    """Authorize using the database's current user role/status.

    The JWT only identifies the user. This prevents a stale token from keeping
    old privileges after an account is disabled or its role changes.
    """
    def deco(fn):
        @wraps(fn)
        def wrapped(*a, **kw):
            try:
                verify_jwt_in_request()
                u = current_user()
                if not u or not u.is_active:
                    return jsonify(success=False, message="Unauthorized"), 403
                if u.role not in allowed:
                    return jsonify(success=False, message="Unauthorized"), 403
            except Exception:
                return jsonify(success=False, message="Authentication required"), 401
            return fn(*a, **kw)
        return wrapped
    return deco
