-- Member deletion cleanup.
--
-- 1) NULL out folders.deletedBy pointers to non-existent members (legacy rows that pre-date
--    the application-level cleanup path; the route always cleared it for the *deleting*
--    member, but a member who was deleted and had previously trashed folders would leave
--    dangling FKs that a later member-delete could not silence).
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
