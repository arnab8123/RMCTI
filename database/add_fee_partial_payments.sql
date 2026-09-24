-- RMCTI fee collection upgrade
-- Allows multiple payment transactions for the same student/month.
-- Run once against the hosted MySQL database before deploying this version.
SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fee_payments'
    AND INDEX_NAME = 'uq_student_month'
);
SET @drop_sql := IF(@idx_exists > 0,
  'ALTER TABLE fee_payments DROP INDEX uq_student_month',
  'SELECT 1');
PREPARE stmt FROM @drop_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fee_payments'
    AND INDEX_NAME = 'idx_fee_payments_student_month_payment'
);
SET @add_sql := IF(@idx_exists = 0,
  'ALTER TABLE fee_payments ADD INDEX idx_fee_payments_student_month_payment(student_id,fee_month,payment_date,id)',
  'SELECT 1');
PREPARE stmt2 FROM @add_sql;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
