"""Idempotent database bootstrap for RMCTI. Run from the project root: python scripts/migrate.py"""
import sys
from pathlib import Path
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app import app
from backend.database import db

ENQUIRIES_SQL = """
CREATE TABLE IF NOT EXISTS enquiries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('new','read','resolved') NOT NULL DEFAULT 'new',
    admin_note TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_enquiries_status_created(status,created_at)
) ENGINE=InnoDB;
"""

with app.app_context():
    db.create_all()
    db.session.execute(text(ENQUIRIES_SQL))
    db.session.commit()
    print("RMCTI database schema is ready. Enquiries table is ready. Existing data is preserved.")
