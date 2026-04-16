CREATE TABLE `invect_apikey` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text DEFAULT 'default' NOT NULL,
	`name` text,
	`start` text,
	`prefix` text,
	`key` text NOT NULL,
	`reference_id` text NOT NULL,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` text,
	`enabled` integer DEFAULT true,
	`rate_limit_enabled` integer,
	`rate_limit_time_window` integer,
	`rate_limit_max` integer,
	`request_count` integer,
	`remaining` integer,
	`last_request` text,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`permissions` text,
	`metadata` text
);
--> statement-breakpoint
DROP INDEX `credentials_webhook_path_unique`;--> statement-breakpoint
ALTER TABLE `invect_credentials` DROP COLUMN `webhook_path`;--> statement-breakpoint
ALTER TABLE `invect_credentials` DROP COLUMN `webhook_secret`;