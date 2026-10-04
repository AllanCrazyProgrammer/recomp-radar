CREATE TABLE `game_covers` (
	`user_id` text NOT NULL,
	`repo` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `repo`)
);
