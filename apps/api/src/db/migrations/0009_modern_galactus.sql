ALTER TABLE `documents` ADD `trashed_under_folder_id` text;--> statement-breakpoint
ALTER TABLE `folders` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `folders` ADD `deleted_by` text REFERENCES members(id);--> statement-breakpoint
ALTER TABLE `folders` ADD `purge_after` text;--> statement-breakpoint
ALTER TABLE `folders` ADD `trashed_under_folder_id` text;--> statement-breakpoint
CREATE INDEX `folders_deleted_at_idx` ON `folders` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `folders_trashed_under_idx` ON `folders` (`trashed_under_folder_id`);