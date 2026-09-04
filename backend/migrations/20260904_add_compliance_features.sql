-- =============================================================================
-- Migration: 20260904_add_compliance_features.sql
-- Description: Schema changes for 5 client-requested features:
--   1. 18+ Age Consent (users.is_18_plus)
--   2. Withdrawal OTPs (otps.purpose)
--   3. Maker-Checker Payout System (withdraw_requests status enum, checked_by, checked_at, checker_notes, otp_verified)
--   4. User Activity Logs table (user_activity_logs)
-- Safe / Idempotent: Can be run multiple times without errors.
-- =============================================================================

-- 1. Ensure `is_18_plus` column exists in `users` table
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'is_18_plus';

SET @stmt = IF(@col_exists = 0, 
  'ALTER TABLE `users` ADD COLUMN `is_18_plus` TINYINT(1) DEFAULT 0 AFTER `is_blocked`', 
  'SELECT "Column users.is_18_plus already exists"');
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Modify `otps.purpose` to support 'withdraw'
ALTER TABLE `otps` MODIFY COLUMN `purpose` VARCHAR(30) NOT NULL DEFAULT 'register';

-- 3. Modify `withdraw_requests` for Maker-Checker and OTP verification
-- Update status ENUM to include 'checked'
ALTER TABLE `withdraw_requests` 
  MODIFY COLUMN `status` ENUM('pending', 'checked', 'approved', 'rejected') DEFAULT 'pending';

-- Add checked_by column if missing
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'withdraw_requests' 
  AND COLUMN_NAME = 'checked_by';

SET @stmt = IF(@col_exists = 0, 
  'ALTER TABLE `withdraw_requests` ADD COLUMN `checked_by` INT(11) NULL AFTER `status`, ADD CONSTRAINT `fk_withdraw_checked_by` FOREIGN KEY (`checked_by`) REFERENCES `users`(`id`) ON DELETE SET NULL', 
  'SELECT "Column checked_by already exists"');
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add checked_at column if missing
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'withdraw_requests' 
  AND COLUMN_NAME = 'checked_at';

SET @stmt = IF(@col_exists = 0, 
  'ALTER TABLE `withdraw_requests` ADD COLUMN `checked_at` TIMESTAMP NULL AFTER `checked_by`', 
  'SELECT "Column checked_at already exists"');
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add checker_notes column if missing
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'withdraw_requests' 
  AND COLUMN_NAME = 'checker_notes';

SET @stmt = IF(@col_exists = 0, 
  'ALTER TABLE `withdraw_requests` ADD COLUMN `checker_notes` VARCHAR(255) NULL AFTER `checked_at`', 
  'SELECT "Column checker_notes already exists"');
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add otp_verified column if missing
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'withdraw_requests' 
  AND COLUMN_NAME = 'otp_verified';

SET @stmt = IF(@col_exists = 0, 
  'ALTER TABLE `withdraw_requests` ADD COLUMN `otp_verified` TINYINT(1) DEFAULT 0 AFTER `checker_notes`', 
  'SELECT "Column otp_verified already exists"');
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Create `user_activity_logs` table
CREATE TABLE IF NOT EXISTS `user_activity_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(50) DEFAULT NULL,
  `entity_id` VARCHAR(50) DEFAULT NULL,
  `details` JSON DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_ual_user_id` (`user_id`),
  KEY `idx_ual_action` (`action`),
  KEY `idx_ual_created_at` (`created_at`),
  CONSTRAINT `fk_ual_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
