CREATE TABLE `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`workspace_id` text,
	`scope` text DEFAULT 'workspace' NOT NULL,
	`trigger_type` text NOT NULL,
	`trigger_config` text,
	`action_type` text NOT NULL,
	`action_config` text,
	`enabled` integer DEFAULT 1,
	`priority` integer DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_automation_workspace` ON `automation_rules` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_automation_trigger` ON `automation_rules` (`trigger_type`);--> statement-breakpoint
CREATE INDEX `idx_automation_enabled` ON `automation_rules` (`enabled`);