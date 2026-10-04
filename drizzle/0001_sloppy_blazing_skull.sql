CREATE TABLE `installations` (
	`user_id` text NOT NULL,
	`repo` text NOT NULL,
	`release_id` text,
	`tag` text NOT NULL,
	`title` text NOT NULL,
	`published_at` text,
	`prerelease` integer,
	`marked_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `repo`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD `release_tag` text;