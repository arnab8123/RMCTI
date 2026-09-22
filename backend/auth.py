from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request,get_jwt,get_jwt_identity
from .models import User
def current_user():
    i=get_jwt_identity()
    return User.query.get(int(i)) if i else None
def roles(*allowed):
    def deco(fn):
        @wraps(fn)
        def wrapped(*a,**kw):
            try:
                verify_jwt_in_request()
                u=current_user()
                if not u or not u.is_active or get_jwt().get("role") not in allowed:
                    return jsonify(success=False,message="Unauthorized"),403
            except Exception:
                return jsonify(success=False,message="Authentication required"),401
            return fn(*a,**kw)
        return wrapped
    return deco
