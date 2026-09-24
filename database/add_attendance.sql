USE tuition_management;

-- For an existing database with an older attendance table, run fix_attendance.sql after this script.

CREATE TABLE IF NOT EXISTS attendance (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 student_id BIGINT UNSIGNED NOT NULL,
 class_id BIGINT UNSIGNED NOT NULL,
 attendance_date DATE NOT NULL,
 status ENUM('present','absent') NOT NULL,
 marked_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_attendance_student_class_date (student_id,class_id,attendance_date),
 CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id),
 CONSTRAINT fk_attendance_class FOREIGN KEY (class_id) REFERENCES classes(id),
 CONSTRAINT fk_attendance_marker FOREIGN KEY (marked_by) REFERENCES users(id)
);
