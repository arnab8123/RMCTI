import sys,os,getpass
sys.path.insert(0,os.path.dirname(os.path.dirname(__file__)))
from backend.app import app
from backend.database import db
from backend.models import User,Admin
from backend.utils import hp
with app.app_context():
 u=input("Admin username: ").strip();p=getpass.getpass("Admin password: ");n=input("Admin name: ").strip() or u
 if User.query.filter_by(username=u).first():raise SystemExit("Username exists")
 x=User(username=u,password_hash=hp(p),role="admin");db.session.add(x);db.session.flush();db.session.add(Admin(user_id=x.id,name=n));db.session.commit();print("Admin created.")
