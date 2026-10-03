"""One-time migration of legacy RMCTI uploaded files from MySQL/local disk to Cloudinary.

Run after deploying the schema migration:
    CLOUDINARY_URL=cloudinary://... python scripts/migrate_cloudinary_files.py

The script is idempotent. It uploads only rows/files that do not already have a
Cloudinary URL, updates user photo references, then removes legacy BLOB rows.
It does not touch frontend/asset/, because those are landing-page assets.
"""
import os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app import app
from backend.database import db
from backend.models import NoticeAttachment, ClassworkAttachment, PhotoAsset, Student, Teacher

def cloudinary_setup():
    import cloudinary
    import cloudinary.uploader
    url=os.getenv("CLOUDINARY_URL","").strip()
    if not url.startswith("cloudinary://"):
        raise SystemExit("CLOUDINARY_URL is required")
    cloudinary.config(cloudinary_url=url, secure=True)
    return cloudinary, cloudinary.uploader

def upload(uploader, data, filename, folder, mime):
    if mime and mime.startswith("image/"):
        resource_type="image"
    else:
        resource_type="raw"
    result=uploader.upload(
        data,
        folder=folder,
        public_id=f"{Path(filename).stem[:80] or 'file'}-{os.urandom(6).hex()}",
        resource_type=resource_type,
        overwrite=False,
        use_filename=False,
        unique_filename=False,
    )
    return result["secure_url"], result.get("public_id"), result.get("resource_type",resource_type)

with app.app_context():
    _, uploader=cloudinary_setup()

    notice_rows=NoticeAttachment.query.filter(NoticeAttachment.data.isnot(None)).all()
    classwork_rows=ClassworkAttachment.query.filter(ClassworkAttachment.data.isnot(None)).all()
    photo_rows=PhotoAsset.query.filter(PhotoAsset.data.isnot(None)).all()

    print(f"Legacy DB files: notice={len(notice_rows)}, classwork={len(classwork_rows)}, photos={len(photo_rows)}")

    for row in notice_rows:
        if row.cloudinary_url:
            continue
        url,pid,rt=upload(uploader, bytes(row.data), row.original_filename, os.getenv("CLOUDINARY_FILE_FOLDER","rmcti/notice-board"), row.mime_type)
        row.cloudinary_url=url; row.cloudinary_public_id=pid; row.cloudinary_resource_type=rt
        row.data=None
        print("notice:",row.id,row.original_filename)

    for row in classwork_rows:
        if row.cloudinary_url:
            continue
        url,pid,rt=upload(uploader, bytes(row.data), row.original_filename, os.getenv("CLOUDINARY_FILE_FOLDER","rmcti/classwork"), row.mime_type)
        row.cloudinary_url=url; row.cloudinary_public_id=pid; row.cloudinary_resource_type=rt
        row.data=None
        print("classwork:",row.id,row.original_filename)

    for row in photo_rows:
        if row.cloudinary_url:
            continue
        url,pid,rt=upload(uploader, bytes(row.data), row.id, os.getenv("CLOUDINARY_FOLDER","rmcti/photos"), row.mime_type)
        row.cloudinary_url=url; row.cloudinary_public_id=pid; row.cloudinary_resource_type=rt
        # Existing applications may store either the asset id or /uploads/photos/<id>.
        for model in (Student, Teacher):
            for person in model.query.filter(model.photo.in_([row.id, f"/uploads/photos/{row.id}"])).all():
                person.photo=url
        row.data=None
        print("photo:",row.id)

    db.session.commit()

    # Remove any now-empty legacy PhotoAsset rows; current user records point to
    # Cloudinary URLs. The table itself can remain for compatibility.
    for row in PhotoAsset.query.filter(PhotoAsset.data.is_(None), PhotoAsset.cloudinary_url.isnot(None)).all():
        db.session.delete(row)
    db.session.commit()

    # Legacy local fallback directory is not part of the landing page. Remove
    # only files that have been migrated through matching person references.
    local_dir=Path(__file__).resolve().parents[1] / "backend" / "uploads" / "photos"
    if local_dir.exists():
        for f in local_dir.iterdir():
            if not f.is_file():
                continue
            refs=Student.query.filter(Student.photo.like(f"%{f.name}%")).count() + Teacher.query.filter(Teacher.photo.like(f"%{f.name}%")).count()
            if refs == 0:
                try: f.unlink()
                except OSError: pass

    print("Cloudinary migration complete. Legacy DB BLOBs have been cleared.")
