-- RMCTI performance indexes for Aiven/MySQL 8.
-- Run once against the production database.
ALTER TABLE teacher_classes ADD INDEX idx_teacher_classes_teacher_status (teacher_id, status);
ALTER TABLE teacher_classes ADD INDEX idx_teacher_classes_class_status (class_id, status);
ALTER TABLE schedule_exceptions ADD INDEX idx_schedule_exceptions_class_week (class_id, week_start);
ALTER TABLE schedule_exceptions ADD INDEX idx_schedule_exceptions_class_target (class_id, target_date, kind);
ALTER TABLE student_classes ADD INDEX idx_student_classes_class_status (class_id, status);
ALTER TABLE student_classes ADD INDEX idx_student_classes_student_status (student_id, status);
ALTER TABLE fee_payments ADD INDEX idx_fee_payments_student_month_date (student_id, fee_month, payment_date);
ALTER TABLE fee_payments ADD INDEX idx_fee_payments_month (fee_month);
ALTER TABLE attendance ADD INDEX idx_attendance_class_date_session (class_id, attendance_date, session_start_time, session_end_time);
\nALTER TABLE schedule_exceptions ADD INDEX idx_schedule_exceptions_week_kind_date_teacher (week_start, kind, schedule_date, teacher_id);
ALTER TABLE schedule_exceptions ADD INDEX idx_schedule_exceptions_date_kind (schedule_date, kind);
