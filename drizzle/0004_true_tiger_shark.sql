ALTER TABLE `folders` ADD `rank` real DEFAULT 0;--> statement-breakpoint
CREATE INDEX `idx_folders_rank` ON `folders` (`rank`);