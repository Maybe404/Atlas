CREATE INDEX `document_members_member_id_idx` ON `document_members` (`member_id`);--> statement-breakpoint
CREATE INDEX `documents_deleted_purge_after_idx` ON `documents` (`deleted_at`,`purge_after`);--> statement-breakpoint
CREATE INDEX `space_members_member_id_idx` ON `space_members` (`member_id`);