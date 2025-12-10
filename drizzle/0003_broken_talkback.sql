CREATE INDEX `idx_folders_created` ON `folders` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_resources_type` ON `resources` (`type`);--> statement-breakpoint
CREATE INDEX `idx_resources_status` ON `resources` (`status`);--> statement-breakpoint
CREATE INDEX `idx_resources_created` ON `resources` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_resources_favorite` ON `resources` (`favorite`);