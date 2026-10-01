-- RMCTI: repair/upgrade file attachment storage for existing MySQL/Aiven databases.
-- Safe for MySQL 8.x. Run once before deploying the updated application.

CREATE TABLE IF NOT EXISTS notice_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
  file_size BIGINT UNSIGNED NOT NULL,
  data MEDIUMBLOB NOT NULL,
  uploaded_by BIGINT NOT NULL,
  target_type ENUM('all','student','class') NOT NULL DEFAULT 'all',
  target_student_id BIGINT UNSIGNED NULL,
  target_class_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notice_attachments_created(created_at),
  INDEX idx_notice_attachments_target_student(target_student_id),
  INDEX idx_notice_attachments_target_class(target_class_id)
) ENGINE=InnoDB;

-- MySQL 8.x supports ADD COLUMN IF NOT EXISTS. This also works when an older
-- RMCTI installation already has notice_attachments without target columns.
ALTER TABLE notice_attachments
  ADD COLUMN IF NOT EXISTS target_type ENUM('all','student','class') NOT NULL DEFAULT 'all' AFTER uploaded_by;

ALTER TABLE notice_attachments
  ADD COLUMN IF NOT EXISTS target_student_id BIGINT UNSIGNED NULL AFTER target_type;

ALTER TABLE notice_attachments
  ADD COLUMN IF NOT EXISTS target_class_id BIGINT UNSIGNED NULL AFTER target_student_id;

CREATE INDEX IF NOT EXISTS idx_notice_attachments_target_student
  ON notice_attachments(target_student_id);

CREATE INDEX IF NOT EXISTS idx_notice_attachments_target_class
  ON notice_attachments(target_class_id);

-- Teacher Classwork attachments.
CREATE TABLE IF NOT EXISTS classwork_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  classwork_id BIGINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(255) NOT NULL DEFAULT 'application/octet-stream',
  file_size BIGINT UNSIGNED NOT NULL,
  data MEDIUMBLOB NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_classwork_attachments_work(classwork_id)
) ENGINE=InnoDB;
