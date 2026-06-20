ALTER TABLE `spaces` ADD `owner_id` text REFERENCES members(id) ON DELETE SET NULL;--> statement-breakpoint
UPDATE `spaces` SET `owner_id` = (
  SELECT `subject_id` FROM `grants`
  WHERE `grants`.`target_type` = 'space' AND `grants`.`target_id` = `spaces`.`id`
    AND `grants`.`subject_type` = 'member' AND `grants`.`role` = 'editor'
  LIMIT 1
) WHERE `personal` = 1 AND `owner_id` IS NULL;--> statement-breakpoint
INSERT INTO `spaces` (`id`, `name`, `mark`, `accent`, `personal`, `owner_id`)
SELECT 'sp_personal_' || `m`.`id`, `m`.`name` || ' · 个人', substr(`m`.`name`, 1, 1), 'plum', 1, `m`.`id`
FROM `members` `m`
WHERE NOT EXISTS (
  SELECT 1 FROM `spaces` `s` WHERE `s`.`personal` = 1 AND `s`.`owner_id` = `m`.`id`
);--> statement-breakpoint
INSERT INTO `grants` (`subject_type`, `subject_id`, `target_type`, `target_id`, `role`)
SELECT 'member', `m`.`id`, 'space', 'sp_personal_' || `m`.`id`, 'editor'
FROM `members` `m`
WHERE EXISTS (SELECT 1 FROM `spaces` `s` WHERE `s`.`id` = 'sp_personal_' || `m`.`id`)
  AND NOT EXISTS (
    SELECT 1 FROM `grants` `g` WHERE `g`.`subject_type` = 'member' AND `g`.`subject_id` = `m`.`id`
      AND `g`.`target_type` = 'space' AND `g`.`target_id` = 'sp_personal_' || `m`.`id`
  );