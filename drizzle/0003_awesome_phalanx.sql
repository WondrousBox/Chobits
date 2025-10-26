CREATE TABLE `resource_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_id` text NOT NULL,
	`workspace_id` text,
	`tag` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_resource_tag` ON `resource_tags` (`resource_id`,`tag`);--> statement-breakpoint
CREATE INDEX `idx_resource_tags_tag` ON `resource_tags` (`tag`);--> statement-breakpoint
CREATE INDEX `idx_resource_tags_workspace` ON `resource_tags` (`workspace_id`);