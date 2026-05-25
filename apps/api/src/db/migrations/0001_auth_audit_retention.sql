ALTER TABLE `members` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `csrf_token` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `documents` ADD `purge_after` text;--> statement-breakpoint
ALTER TABLE `share_links` ADD `revoked_at` text;--> statement-breakpoint
ALTER TABLE `share_links` ADD `last_accessed_at` text;--> statement-breakpoint
ALTER TABLE `share_links` ADD `access_count` integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
