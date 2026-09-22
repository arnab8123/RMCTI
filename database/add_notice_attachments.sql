-- RMCTI Notice Board file attachments
-- Stores small institute notices/documents in MySQL so files survive Render restarts.
CREATE TABLE IF NOT EXISTS notice_attachments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(255) NOT NULL,
 original_filename VARCHAR(255) NOT NULL,
 mime_type VARCHAR(100) NOT NULL,
 file_size BIGINT UNSIGNED NOT NULL,
 data MEDIUMBLOB NOT NULL,
 uploaded_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_notice_attachments_created(created_at),
 CONSTRAINT fk_notice_attachments_uploaded_by FOREIGN KEY(uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;
