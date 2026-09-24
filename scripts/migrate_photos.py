"""Migrate existing RMCTI MySQL photo BLOBs to Cloudinary.

Required environment:
  CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME

Run once against the same Aiven database: python scripts/migrate_photos.py
The script updates teachers.photo and students.photo to direct Cloudinary URLs
and leaves photo_assets untouched as a rollback/fallback copy.
"""
import os
from backend.app import app
from backend.database import db
from backend.models import PhotoAsset, Teacher, Student

if not os.getenv("CLOUDINARY_URL"):
    raise SystemExit("CLOUDINARY_URL is required")

import cloudinary.uploader

with app.app_context():
    people=[]
    for model in (Teacher, Student):
        people.extend(model.query.filter(model.photo.isnot(None)).all())

    migrated=0
    skipped=0
    missing=0
    for person in people:
        ref=str(person.photo or "")
        if ref.startswith("http://") or ref.startswith("https://"):
            skipped += 1
            continue
        filename=ref.split("/uploads/photos/")[-1].split("?")[0].split("/")[-1]
        asset=PhotoAsset.query.filter_by(id=filename).first()
        if not asset:
            missing += 1
            print(f"MISSING: {filename} for {person.__class__.__name__} {person.id}")
            continue
        try:
            role_folder="teachers" if isinstance(person, Teacher) else "students"
            public_id=f"{person.__class__.__name__.lower()}-{person.id}-{os.path.splitext(filename)[0]}"
            result=cloudinary.uploader.upload(
                asset.data,
                folder=f"{os.getenv('CLOUDINARY_FOLDER', 'rmcti/photos')}/{role_folder}",
                public_id=public_id,
                resource_type="image",
                overwrite=True,
                transformation=[{"width":600,"height":800,"crop":"fill","gravity":"auto","quality":"auto","fetch_format":"auto"}]
            )
            person.photo=result["secure_url"]
            migrated += 1
            print(f"OK: {person.__class__.__name__} {person.id}")
        except Exception as exc:
            db.session.rollback()
            raise RuntimeError(f"Cloudinary migration failed for {filename}: {exc}") from exc
    db.session.commit()
    print(f"Migrated={migrated} Skipped={skipped} Missing={missing}")
