CREATE INDEX `documents_space_id_idx` ON `documents` (`space_id`);--> statement-breakpoint
CREATE INDEX `documents_author_id_idx` ON `documents` (`author_id`);--> statement-breakpoint
CREATE INDEX `documents_visibility_idx` ON `documents` (`visibility`);--> statement-breakpoint
CREATE INDEX `documents_deleted_at_idx` ON `documents` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `documents_space_deleted_idx` ON `documents` (`space_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `documents_visibility_deleted_idx` ON `documents` (`visibility`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `documents_author_deleted_idx` ON `documents` (`author_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `sessions_member_id_idx` ON `sessions` (`member_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `share_links_document_id_idx` ON `share_links` (`document_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_id_idx` ON `audit_logs` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_target_id_idx` ON `audit_logs` (`target_id`);
