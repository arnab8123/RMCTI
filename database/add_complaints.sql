USE tuition_management;

CREATE TABLE IF NOT EXISTS complaints (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 student_id BIGINT UNSIGNED NOT NULL,
 complaint_date DATE NOT NULL,
 subject VARCHAR(255) NOT NULL,
 description TEXT NOT NULL,
 status ENUM('open','in_progress','resolved') NOT NULL DEFAULT 'open',
 admin_note TEXT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
 INDEX idx_complaints_student_date(student_id,complaint_date),
 INDEX idx_complaints_status(status)
) ENGINE=InnoDB;
