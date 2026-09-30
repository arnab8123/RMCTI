-- RMCTI: free/paid courses + classwork file attachments
-- Safe to run once on an existing MySQL/Aiven database.

SET @has_course_type := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='classes' AND COLUMN_NAME='course_type');
SET @sql := IF(@has_course_type=0, "ALTER TABLE classes ADD COLUMN course_type ENUM('paid','free') NOT NULL DEFAULT 'paid' AFTER max_students", "SELECT 1");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS classwork_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  classwork_id BIGINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(255) NOT NULL DEFAULT 'application/octet-stream',
  file_size BIGINT UNSIGNED NOT NULL,
  data MEDIUMBLOB NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_classwork_attachments_work(classwork_id),
  CONSTRAINT fk_classwork_attachments_work FOREIGN KEY (classwork_id) REFERENCES classwork(id) ON DELETE CASCADE
) ENGINE=InnoDB;
