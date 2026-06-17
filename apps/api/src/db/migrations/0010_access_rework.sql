ALTER TABLE `documents` ADD `access` text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
UPDATE `documents` SET `access` = CASE WHEN `visibility` = 'private' THEN 'restricted' ELSE 'inherit' END;--> statement-breakpoint
DROP INDEX IF EXISTS `documents_visibility_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `documents_visibility_deleted_idx`;--> statement-breakpoint
ALTER TABLE `documents` DROP COLUMN `visibility`;--> statement-breakpoint
CREATE INDEX `documents_access_idx` ON `documents` (`access`);--> statement-breakpoint
CREATE INDEX `documents_access_deleted_idx` ON `documents` (`access`,`deleted_at`);
