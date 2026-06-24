-- Member deletion cleanup (Phase: harden / 5+8+12).
-- 1) NULL out folders.deletedBy pointers to non-existent members (legacy rows that pre-date
--    the application-level cleanup path).
UPDATE `folders` SET `deleted_by` = NULL
WHERE `deleted_by` IS NOT NULL
  AND `deleted_by` NOT IN (SELECT `id` FROM `members`);
--> statement-breakpoint
-- 2) Drop personal spaces whose owner is gone (they'd be invisible-but-occupying rows
--    otherwise — no grants survive, the owner grant was removed with the member, and even
--    admins can't usefully access them).
DELETE FROM `spaces`
WHERE `personal` = 1
  AND `owner_id` IS NOT NULL
  AND `owner_id` NOT IN (SELECT `id` FROM `members`);
--> statement-breakpoint
-- 3) Recreate `folders` so `deleted_by` carries ON DELETE SET NULL. SQLite can't edit a
--    foreign-key clause in place; the standard table-rebuild pattern is used here. We avoid
--    the `PRAGMA foreign_keys` toggle because each statement in this migration is its own
--    implicit transaction, and the rebuild's DROP+CREATE+INSERT chain doesn't depend on
--    cross-statement FK deferral (no other table references folders.deletedBy).
CREATE TABLE `__new_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`restricted` integer DEFAULT 0 NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`deleted_at` text,
	`deleted_by` text,
	`purge_after` text,
	`trashed_under_folder_id` text,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deleted_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_folders` (`id`, `space_id`, `parent_id`, `name`, `restricted`, `order`, `created_at`, `deleted_at`, `deleted_by`, `purge_after`, `trashed_under_folder_id`)
SELECT `id`, `space_id`, `parent_id`, `name`, `restricted`, `order`, `created_at`, `deleted_at`, `deleted_by`, `purge_after`, `trashed_under_folder_id` FROM `folders`;
--> statement-breakpoint
DROP TABLE `folders`;
--> statement-breakpoint
ALTER TABLE `__new_folders` RENAME TO `folders`;
--> statement-breakpoint
CREATE INDEX `folders_space_id_idx` ON `folders` (`space_id`);
--> statement-breakpoint
CREATE INDEX `folders_parent_id_idx` ON `folders` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `folders_deleted_at_idx` ON `folders` (`deleted_at`);
--> statement-breakpoint
CREATE INDEX `folders_trashed_under_idx` ON `folders` (`trashed_under_folder_id`);
