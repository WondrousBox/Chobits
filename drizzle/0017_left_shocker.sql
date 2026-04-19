CREATE TABLE `linked_folder_mounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`root_folder_id` text,
	`absolute_path` text NOT NULL,
	`display_name` text NOT NULL,
	`authorized_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`last_scan_at` integer,
	`watch_enabled` integer DEFAULT 0,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_linked_folder_mounts_workspace` ON `linked_folder_mounts` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_linked_folder_mounts_root_folder` ON `linked_folder_mounts` (`root_folder_id`);--> statement-breakpoint
CREATE INDEX `idx_linked_folder_mounts_status` ON `linked_folder_mounts` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_linked_folder_mounts_workspace_path` ON `linked_folder_mounts` (`workspace_id`,`absolute_path`);--> statement-breakpoint
ALTER TABLE `folders` ADD `origin_type` text DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE `folders` ADD `linked_mount_id` text REFERENCES linked_folder_mounts(id);--> statement-breakpoint
ALTER TABLE `folders` ADD `relative_path` text;--> statement-breakpoint
CREATE INDEX `idx_folders_origin` ON `folders` (`origin_type`);--> statement-breakpoint
CREATE INDEX `idx_folders_linked_mount` ON `folders` (`linked_mount_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_folders_linked_mount_relative_path` ON `folders` (`linked_mount_id`,`relative_path`);--> statement-breakpoint
ALTER TABLE `resources` ADD `origin_type` text DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE `resources` ADD `linked_mount_id` text REFERENCES linked_folder_mounts(id);--> statement-breakpoint
ALTER TABLE `resources` ADD `relative_path` text;--> statement-breakpoint
ALTER TABLE `resources` ADD `external_mtime_ms` integer;--> statement-breakpoint
ALTER TABLE `resources` ADD `external_size_bytes` integer;--> statement-breakpoint
ALTER TABLE `resources` ADD `sync_state` text DEFAULT 'synced';--> statement-breakpoint
CREATE INDEX `idx_resources_origin` ON `resources` (`origin_type`);--> statement-breakpoint
CREATE INDEX `idx_resources_linked_mount` ON `resources` (`linked_mount_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_resources_linked_mount_relative_path` ON `resources` (`linked_mount_id`,`relative_path`);