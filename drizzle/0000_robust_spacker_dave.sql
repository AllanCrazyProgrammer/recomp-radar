CREATE TABLE `cache` (
	`path` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`etag` text,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`repo` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text NOT NULL,
	`date` text NOT NULL,
	`source_updated` text,
	`revision` text NOT NULL,
	`status` text NOT NULL,
	`assets` integer DEFAULT 0 NOT NULL,
	`first_seen` text NOT NULL,
	`detected_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reads` (
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`revision` text NOT NULL,
	`read_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `event_id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `targets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`repos` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`last_sync` text,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `target_user_key` ON `targets` (`user_id`,`key`);