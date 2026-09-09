-- Migration: Clean removal of SMS auto-deposit tables and setup clean Juspay deposits table
-- Date: 2026-09-09

-- 1. Drop obsolete log tables
DROP TABLE IF EXISTS `utr_attempt_logs`;
DROP TABLE IF EXISTS `auto_deposit_logs`;

-- 2. Drop foreign key constraints on deposits table before dropping referenced tables
SET @drop_fk_order = (
  SELECT IF(COUNT(*) > 0, 'ALTER TABLE `deposits` DROP FOREIGN KEY `fk_deposits_order`', 'SELECT 1')
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'deposits' AND CONSTRAINT_NAME = 'fk_deposits_order'
);
PREPARE stmt1 FROM @drop_fk_order;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @drop_fk_webhook = (
  SELECT IF(COUNT(*) > 0, 'ALTER TABLE `deposits` DROP FOREIGN KEY `fk_deposits_webhook`', 'SELECT 1')
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'deposits' AND CONSTRAINT_NAME = 'fk_deposits_webhook'
);
PREPARE stmt2 FROM @drop_fk_webhook;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 3. Drop obsolete payment tables
DROP TABLE IF EXISTS `upi_webhook_transactions`;
DROP TABLE IF EXISTS `pending_deposit_orders`;

-- 4. Recreate clean modern deposits table for Juspay
DROP TABLE IF EXISTS `deposits`;

CREATE TABLE `deposits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `order_id` varchar(100) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'INR',
  `status` enum('pending','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  `gateway` varchar(50) NOT NULL DEFAULT 'juspay',
  `gateway_order_id` varchar(100) DEFAULT NULL,
  `gateway_txn_id` varchar(100) DEFAULT NULL,
  `payment_method` varchar(50) DEFAULT NULL,
  `payment_url` text DEFAULT NULL,
  `payer_vpa` varchar(150) DEFAULT NULL,
  `payer_name` varchar(150) DEFAULT NULL,
  `utr_number` varchar(100) DEFAULT NULL,
  `failure_reason` varchar(255) DEFAULT NULL,
  `raw_response` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_deposits_order_id` (`order_id`),
  KEY `idx_deposits_user` (`user_id`),
  KEY `idx_deposits_status` (`status`),
  KEY `idx_deposits_gateway_txn` (`gateway_txn_id`),
  KEY `idx_deposits_created_at` (`created_at`),
  CONSTRAINT `fk_deposits_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Drop obsolete scanner audit and fraud tables
DROP TABLE IF EXISTS `moderator_scanner_audit_logs`;
DROP TABLE IF EXISTS `fraud_alerts`;

-- 6. Clean up obsolete payment/scanner columns on users table if present (universal MySQL & MariaDB compatibility)
SET @drop_col1 = (
  SELECT IF(COUNT(*) > 0, 'ALTER TABLE `users` DROP COLUMN `scanner_label`', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'scanner_label'
);
PREPARE stmt_c1 FROM @drop_col1;
EXECUTE stmt_c1;
DEALLOCATE PREPARE stmt_c1;

SET @drop_col2 = (
  SELECT IF(COUNT(*) > 0, 'ALTER TABLE `users` DROP COLUMN `scanner_enabled`', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'scanner_enabled'
);
PREPARE stmt_c2 FROM @drop_col2;
EXECUTE stmt_c2;
DEALLOCATE PREPARE stmt_c2;

SET @drop_col3 = (
  SELECT IF(COUNT(*) > 0, 'ALTER TABLE `users` DROP COLUMN `upi_id`', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'upi_id'
);
PREPARE stmt_c3 FROM @drop_col3;
EXECUTE stmt_c3;
DEALLOCATE PREPARE stmt_c3;


-- 7. Drop obsolete experimental tables if present
DROP TABLE IF EXISTS `aviator_bets`;
DROP TABLE IF EXISTS `aviator_rounds`;
DROP TABLE IF EXISTS `aviator_settings`;

-- 8. Ensure deposit limits exist in settings table
INSERT INTO `settings` (`setting_key`, `setting_value`) VALUES
  ('min_deposit', '100'),
  ('max_deposit', '50000')
ON DUPLICATE KEY UPDATE `setting_value` = `setting_value`;

