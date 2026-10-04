CREATE INDEX `events_repo_detected_date` ON `events` (`repo`,`detected_at`,`date`);--> statement-breakpoint
CREATE INDEX `events_repo_kind_date` ON `events` (`repo`,`kind`,`date`);