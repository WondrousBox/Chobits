CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parent_id` text,
	`workspace_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	`deleted_at` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_folders_parent` ON `folders` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_folders_workspace` ON `folders` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_folders_ws_parent_name` ON `folders` (`workspace_id`,`parent_id`,`name`);--> statement-breakpoint
ALTER TABLE `resources` ADD `folder_id` text REFERENCES folders(id);--> statement-breakpoint
CREATE INDEX `idx_resources_folder` ON `resources` (`folder_id`);