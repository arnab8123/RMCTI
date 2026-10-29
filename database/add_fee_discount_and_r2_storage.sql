-- RMCTI fee discounts + Cloudflare R2 file storage metadata.
-- The legacy column names below are retained for compatibility with existing databases;
-- new uploads use them only to store an R2 object URL/key/provider marker.

ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER amount;

ALTER TABLE notice_attachments
  ADD COLUMN IF NOT EXISTS cloudinary_url VARCHAR(1000) NULL,
  ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS cloudinary_resource_type VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1000) NULL;

ALTER TABLE classwork_attachments
  ADD COLUMN IF NOT EXISTS cloudinary_url VARCHAR(1000) NULL,
  ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS cloudinary_resource_type VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1000) NULL;

ALTER TABLE notice_attachments MODIFY COLUMN data MEDIUMBLOB NULL;
ALTER TABLE classwork_attachments MODIFY COLUMN data MEDIUMBLOB NULL;

ALTER TABLE photo_assets
  ADD COLUMN IF NOT EXISTS cloudinary_url VARCHAR(1000) NULL,
  ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS cloudinary_resource_type VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1000) NULL;
ALTER TABLE photo_assets MODIFY COLUMN data MEDIUMBLOB NULL;
