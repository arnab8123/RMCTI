-- RMCTI: schedule controls + Aadhaar + targeted admin attachments
-- Preferred for an existing Aiven/production database:
--     python scripts/migrate.py
-- This SQL is provided for manual MySQL execution if needed.
-- Run once.

ALTER TABLE teachers ADD COLUMN aadhaar_number VARCHAR(20) NULL;
ALTER TABLE students ADD COLUMN aadhaar_number VARCHAR(20) NULL;

ALTER TABLE notice_attachments
  ADD COLUMN target_type ENUM('all','student','class') NOT NULL DEFAULT 'all',
  ADD COLUMN target_student_id BIGINT UNSIGNED NULL,
  ADD COLUMN target_class_id BIGINT UNSIGNED NULL;

CREATE INDEX idx_notice_attachments_target_student ON notice_attachments(target_student_id);
CREATE INDEX idx_notice_attachments_target_class ON notice_attachments(target_class_id);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 class_id BIGINT UNSIGNED NOT NULL,
 allocation_id BIGINT UNSIGNED NULL,
 week_start DATE NOT NULL,
 schedule_date DATE NULL,
 target_date DATE NULL,
 kind ENUM('delete','reschedule','extra','weekly_time') NOT NULL,
 start_time TIME NULL,
 end_time TIME NULL,
 teacher_id BIGINT UNSIGNED NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_schedule_exceptions_class_week(class_id,week_start),
 INDEX idx_schedule_exceptions_date(class_id,schedule_date),
 FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
 FOREIGN KEY(allocation_id) REFERENCES teacher_classes(id) ON DELETE CASCADE,
 FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
 FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;
