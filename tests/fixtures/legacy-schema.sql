-- Legacy SQLite fixtures for regression tests of retained pure domain functions.

-- 0000_robust_spacker_dave.sql
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

-- 0001_sloppy_blazing_skull.sql
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

-- 0002_tranquil_nextwave.sql
CREATE TABLE `game_covers` (
	`user_id` text NOT NULL,
	`repo` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `repo`)
);


-- 0003_odd_jackpot.sql
CREATE INDEX `events_repo_detected_date` ON `events` (`repo`,`detected_at`,`date`);--> statement-breakpoint
CREATE INDEX `events_repo_kind_date` ON `events` (`repo`,`kind`,`date`);

-- 0004_spicy_wallow.sql
CREATE TABLE `social_blocks` (
	`blocker` text NOT NULL,
	`blocked` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`blocker`, `blocked`)
);
--> statement-breakpoint
CREATE INDEX `social_blocked` ON `social_blocks` (`blocked`);--> statement-breakpoint
CREATE TABLE `social_limits` (
	`user_id` text NOT NULL,
	`bucket` text NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`user_id`, `bucket`)
);
--> statement-breakpoint
CREATE TABLE `social_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`alias` text NOT NULL,
	`discoverable` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_public_id` ON `social_profiles` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `social_alias` ON `social_profiles` (`alias`);--> statement-breakpoint
CREATE TABLE `social_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_low` text NOT NULL,
	`user_high` text NOT NULL,
	`requester` text NOT NULL,
	`state` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_pair` ON `social_relations` (`user_low`,`user_high`);--> statement-breakpoint
CREATE INDEX `social_low_state` ON `social_relations` (`user_low`,`state`);--> statement-breakpoint
CREATE INDEX `social_high_state` ON `social_relations` (`user_high`,`state`);
