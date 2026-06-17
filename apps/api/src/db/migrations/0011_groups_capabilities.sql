CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`member_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `member_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_members_member_id_idx` ON `group_members` (`member_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
UPDATE `members` SET `role` = 'member' WHERE `role` IN ('editor', 'viewer');
