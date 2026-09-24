USE tuition_management;

-- Attendance is session-specific so the same course can have multiple
-- sessions on the same day with independent attendance records.
SET @has_start := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'session_start_time'
);
SET @sql := IF(@has_start = 0,
  'ALTER TABLE attendance ADD COLUMN session_start_time TIME NULL AFTER attendance_date',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_end := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'session_end_time'
);
SET @sql := IF(@has_end = 0,
  'ALTER TABLE attendance ADD COLUMN session_end_time TIME NULL AFTER session_start_time',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Remove the old one-record-per-student/class/day uniqueness rule if present.
SET @has_old := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance'
    AND CONSTRAINT_NAME = 'uq_attendance_student_class_date'
);
SET @sql := IF(@has_old = 1,
  'ALTER TABLE attendance DROP INDEX uq_attendance_student_class_date',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_new := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance'
    AND CONSTRAINT_NAME = 'uq_attendance_student_class_session'
);
SET @sql := IF(@has_new = 0,
  'ALTER TABLE attendance ADD UNIQUE KEY uq_attendance_student_class_session (student_id,class_id,attendance_date,session_start_time,session_end_time)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
