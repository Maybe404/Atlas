-- Persist login-failure counts so rate limits survive process restarts and (more importantly)
-- share state across replicas. Rows self-expire on read via `reset_at`; no background sweep
-- needed.
CREATE TABLE `login_failures` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`reset_at` text NOT NULL
);
