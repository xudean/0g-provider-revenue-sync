CREATE DATABASE IF NOT EXISTS `og_compute_revenue`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `og_compute_revenue`;

CREATE TABLE IF NOT EXISTS `providers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `network` VARCHAR(64) NOT NULL,
  `service_kind` ENUM('inference', 'fine_tuning') NOT NULL,
  `provider_address` VARCHAR(42) NOT NULL,
  `service_url` TEXT NULL,
  `service_type` VARCHAR(255) NULL,
  `model_name` TEXT NULL,
  `verifiability` VARCHAR(255) NULL,
  `input_price` VARCHAR(78) NULL,
  `output_price` VARCHAR(78) NULL,
  `price_per_token` VARCHAR(78) NULL,
  `quota_json` JSON NULL,
  `models_json` JSON NULL,
  `additional_info` JSON NULL,
  `tee_signer_address` VARCHAR(42) NULL,
  `tee_signer_acknowledged` TINYINT(1) NOT NULL DEFAULT 0,
  `occupied` TINYINT(1) NULL,
  `updated_at_onchain` BIGINT NULL,
  `raw_service_json` JSON NOT NULL,
  `synced_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_provider` (`network`, `service_kind`, `provider_address`)
);

CREATE TABLE IF NOT EXISTS `settlement_cycles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `network` VARCHAR(64) NOT NULL,
  `service_kind` ENUM('inference', 'fine_tuning') NOT NULL,
  `contract_address` VARCHAR(42) NOT NULL,
  `provider_address` VARCHAR(42) NOT NULL,
  `tx_hash` VARCHAR(66) NOT NULL,
  `block_number` BIGINT NOT NULL,
  `block_timestamp` BIGINT NOT NULL,
  `item_count` INT NOT NULL DEFAULT 0,
  `transfer_amount` VARCHAR(78) NOT NULL,
  `raw_summary_json` JSON NOT NULL,
  `synced_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_cycle` (`network`, `service_kind`, `tx_hash`),
  KEY `idx_cycle_provider` (`provider_address`, `block_number`)
);

CREATE TABLE IF NOT EXISTS `settlement_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `network` VARCHAR(64) NOT NULL,
  `service_kind` ENUM('inference', 'fine_tuning') NOT NULL,
  `contract_address` VARCHAR(42) NOT NULL,
  `provider_address` VARCHAR(42) NOT NULL,
  `user_address` VARCHAR(42) NOT NULL,
  `tx_hash` VARCHAR(66) NOT NULL,
  `log_index` BIGINT NOT NULL,
  `block_number` BIGINT NOT NULL,
  `block_timestamp` BIGINT NOT NULL,
  `event_name` VARCHAR(64) NOT NULL,
  `status_code` INT NULL,
  `status_label` VARCHAR(64) NULL,
  `requested_amount` VARCHAR(78) NULL,
  `unsettled_amount` VARCHAR(78) NULL,
  `transfer_amount` VARCHAR(78) NOT NULL,
  `fee` VARCHAR(78) NULL,
  `deliverable_id` TEXT NULL,
  `acknowledged` TINYINT(1) NULL,
  `settlement_nonce` VARCHAR(78) NULL,
  `requests_hash` VARCHAR(66) NULL,
  `raw_event_json` JSON NOT NULL,
  `synced_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_item` (`network`, `service_kind`, `tx_hash`, `log_index`),
  KEY `idx_item_provider` (`provider_address`, `block_number`)
);

CREATE TABLE IF NOT EXISTS `sync_state` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `network` VARCHAR(64) NOT NULL,
  `service_kind` ENUM('inference', 'fine_tuning') NOT NULL,
  `sync_type` ENUM('providers', 'settlements') NOT NULL,
  `last_synced_block` BIGINT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_sync_state` (`network`, `service_kind`, `sync_type`)
);
