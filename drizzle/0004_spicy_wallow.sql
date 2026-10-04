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