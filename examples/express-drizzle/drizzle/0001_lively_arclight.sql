CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` text,
	`refresh_token_expires_at` text,
	`scope` text,
	`password` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rbac_scope_access` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`user_id` text,
	`team_id` text,
	`permission` text DEFAULT 'viewer' NOT NULL,
	`granted_by` text,
	`granted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `rbac_teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rbac_team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `rbac_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rbac_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parent_id` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`parent_id`) REFERENCES `rbac_teams`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	`token` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`impersonated_by` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'default',
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `webhook_triggers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`webhook_path` text NOT NULL,
	`provider` text DEFAULT 'generic' NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`allowed_methods` text DEFAULT 'POST' NOT NULL,
	`hmac_enabled` integer DEFAULT false NOT NULL,
	`hmac_header_name` text,
	`hmac_secret` text,
	`allowed_ips` text,
	`flow_id` text,
	`node_id` text,
	`last_triggered_at` text,
	`last_payload` text,
	`trigger_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`flow_id`) REFERENCES `flows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_triggers_webhook_path_unique` ON `webhook_triggers` (`webhook_path`);--> statement-breakpoint
ALTER TABLE `flows` ADD `scope_id` text REFERENCES rbac_teams(id);