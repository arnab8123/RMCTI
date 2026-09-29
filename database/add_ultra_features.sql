-- RMCTI Ultra: tests, study library, advanced fees, notice read tracking
CREATE TABLE IF NOT EXISTS tests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(255) NOT NULL,
 class_id BIGINT UNSIGNED NOT NULL,
 subject_id BIGINT UNSIGNED NOT NULL,
 teacher_id BIGINT UNSIGNED NOT NULL,
 duration_minutes INT NOT NULL DEFAULT 30,
 total_marks DECIMAL(10,2) NOT NULL DEFAULT 0,
 status ENUM('draft','published','closed') NOT NULL DEFAULT 'draft',
 starts_at DATETIME NULL, ends_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_tests_class_status(class_id,status),
 INDEX idx_tests_teacher_created(teacher_id,created_at),
 FOREIGN KEY(class_id) REFERENCES classes(id), FOREIGN KEY(subject_id) REFERENCES subjects(id), FOREIGN KEY(teacher_id) REFERENCES teachers(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS test_questions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 test_id BIGINT UNSIGNED NOT NULL,
 question_text TEXT NOT NULL,
 question_type ENUM('mcq','true_false','short_answer','numerical','multiple_choice') NOT NULL,
 marks DECIMAL(8,2) NOT NULL DEFAULT 1,
 options_json TEXT NULL, answer_json TEXT NULL, explanation TEXT NULL,
 position INT NOT NULL DEFAULT 0,
 INDEX idx_test_questions_test_position(test_id,position),
 FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS test_attempts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 test_id BIGINT UNSIGNED NOT NULL, student_id BIGINT UNSIGNED NOT NULL,
 started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, submitted_at DATETIME NULL,
 time_taken_seconds INT NULL, score DECIMAL(10,2) NULL, percentage DECIMAL(6,2) NULL,
 correct_answers INT NOT NULL DEFAULT 0, wrong_answers INT NOT NULL DEFAULT 0,
 status ENUM('in_progress','submitted','expired') NOT NULL DEFAULT 'in_progress',
 answers_json LONGTEXT NULL,
 UNIQUE KEY uq_test_attempt_student(test_id,student_id),
 INDEX idx_test_attempt_student_status(student_id,status),
 FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE,
 FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_materials (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(255) NOT NULL, class_id BIGINT UNSIGNED NULL, subject_id BIGINT UNSIGNED NOT NULL,
 chapter VARCHAR(150) NULL,
 material_type ENUM('pdf','notes','image','question_paper','syllabus','previous_year','important_questions','reference') NOT NULL,
 file_url VARCHAR(1000) NOT NULL, original_filename VARCHAR(255) NOT NULL, file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
 uploaded_by BIGINT UNSIGNED NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_material_subject_chapter_type(subject_id,chapter,material_type),
 INDEX idx_material_class_created(class_id,created_at),
 FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE SET NULL,
 FOREIGN KEY(subject_id) REFERENCES subjects(id),
 FOREIGN KEY(uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fee_adjustments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, student_id BIGINT UNSIGNED NOT NULL, fee_month DATE NOT NULL,
 kind ENUM('discount','scholarship','installment','custom_fee','admission_fee','exam_fee','registration_fee','material_fee','refund','advance','carry_forward','fine') NOT NULL,
 amount DECIMAL(10,2) NOT NULL, note VARCHAR(500) NULL, created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_fee_adjustments_student_month(student_id,fee_month),
 FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE, FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notice_reads (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, notice_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_notice_read_user(notice_id,user_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
 ip_address VARCHAR(64) NULL, user_agent VARCHAR(500) NULL, success BOOLEAN NOT NULL DEFAULT TRUE,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_login_history_user_created(user_id,created_at),
 INDEX idx_login_history_success_created(success,created_at),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notices (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, body TEXT NOT NULL,
 notice_type ENUM('holiday','exam','fee','schedule','important','general') NOT NULL DEFAULT 'general',
 target_type ENUM('all','course','class','student','teachers') NOT NULL DEFAULT 'all',
 target_id BIGINT UNSIGNED NULL, priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
 attachment_url VARCHAR(1000) NULL, expires_at DATETIME NULL, created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_notices_target_expiry(target_type,target_id,expires_at), INDEX idx_notices_created(created_at),
 FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;

ALTER TABLE fee_adjustments MODIFY kind ENUM('discount','scholarship','installment','custom_fee','admission_fee','exam_fee','registration_fee','material_fee','refund','advance','carry_forward','fine') NOT NULL;
