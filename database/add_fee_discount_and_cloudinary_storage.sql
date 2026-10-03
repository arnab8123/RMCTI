-- RMCTI fee discounts + Cloudinary file storage
-- Safe for existing databases. Run scripts/migrate.py as the normal deployment migration first.

ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER amount;

ALTER TABLE notice_attachments
  ADD COLUMN IF NOT EXISTS cloudinary_url VARCHAR(1000) NULL,
  ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS cloudinary_resource_type VARCHAR(20) NULL;

ALTER TABLE classwork_attachments
  ADD COLUMN IF NOT EXISTS cloudinary_url VARCHAR(1000) NULL,
  ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS cloudinary_resource_type VARCHAR(20) NULL;

ALTER TABLE notice_attachments MODIFY COLUMN data MEDIUMBLOB NULL;
ALTER TABLE classwork_attachments MODIFY COLUMN data MEDIUMBLOB NULL;

-- After scripts/migrate_cloudinary_files.py completes successfully and verifies
-- all existing BLOBs were transferred, data can be removed to shrink MySQL:
-- ALTER TABLE notice_attachments DROP COLUMN data;
-- ALTER TABLE classwork_attachments DROP COLUMN data;

ALTER TABLE photo_assets ADD COLUMN IF NOT EXISTS cloudinary_url VARCHAR(1000) NULL, ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(500) NULL, ADD COLUMN IF NOT EXISTS cloudinary_resource_type VARCHAR(20) NULL;
ALTER TABLE photo_assets MODIFY COLUMN data MEDIUMBLOB NULL;
