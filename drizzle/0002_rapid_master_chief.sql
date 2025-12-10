CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text,
	`status` text NOT NULL,
	`input` text,
	`output` text,
	`error` text,
	`nodes` text,
	`metadata` text,
	`duration` integer,
	`started_at` integer DEFAULT (unixepoch('now')*1000),
	`completed_at` integer,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflow` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_status` ON `workflow_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_started` ON `workflow_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`definition` text NOT NULL,
	`enabled` integer DEFAULT true,
	`type` text,
	`workspace_id` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workflows_workspace` ON `workflows` (`workspace_id`);