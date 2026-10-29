-- RMCTI Cloudflare R2 object keys and student saved work
ALTER TABLE notice_attachments ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1000) NULL;
ALTER TABLE classwork_attachments ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1000) NULL;
ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1000) NULL;
CREATE TABLE IF NOT EXISTS student_saved_work (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 student_id BIGINT NOT NULL, title VARCHAR(255) NOT NULL, content TEXT NOT NULL,
 original_filename VARCHAR(255) NULL, mime_type VARCHAR(255) NULL, file_size BIGINT NOT NULL DEFAULT 0,
 storage_key VARCHAR(1000) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_student_saved_work_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
 INDEX idx_student_saved_work_student_updated (student_id, updated_at)
);
-- Existing legacy object references are preserved. Copy legacy files to R2 before removing their previous storage.
