USE tuition_management;

-- Safe migration for existing RMCTI databases.
-- Adds the teacher/user marker column only when it is missing.
SET @has_marked_by := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance'
    AND COLUMN_NAME = 'marked_by'
);
SET @sql := IF(
  @has_marked_by = 0,
  'ALTER TABLE attendance ADD COLUMN marked_by BIGINT UNSIGNED NOT NULL AFTER status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add the foreign key only when it is missing.
SET @has_marker_fk := (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance'
    AND COLUMN_NAME = 'marked_by'
    AND REFERENCED_TABLE_NAME = 'users'
);
SET @sql := IF(
  @has_marker_fk = 0,
  'ALTER TABLE attendance ADD CONSTRAINT fk_attendance_marker FOREIGN KEY (marked_by) REFERENCES users(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
