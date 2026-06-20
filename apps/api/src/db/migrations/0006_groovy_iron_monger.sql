CREATE TABLE `grants` (
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`subject_type`, `subject_id`, `target_type`, `target_id`)
);
--> statement-breakpoint
CREATE INDEX `grants_subject_idx` ON `grants` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `grants_target_idx` ON `grants` (`target_type`,`target_id`);--> statement-breakpoint
INSERT INTO `grants` (`subject_type`, `subject_id`, `target_type`, `target_id`, `role`)
SELECT 'member', `member_id`, 'space', `space_id`, `role` FROM `space_members`;--> statement-breakpoint
INSERT INTO `grants` (`subject_type`, `subject_id`, `target_type`, `target_id`, `role`)
SELECT 'member', `member_id`, 'document', `document_id`, `role` FROM `document_members`;