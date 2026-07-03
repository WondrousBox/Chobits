CREATE TABLE `project_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`importance` real DEFAULT 0.5 NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`event_time` integer,
	`due_at` integer,
	`source_conversation_id` text,
	`source_seq_start` integer,
	`source_seq_end` integer,
	`source_route_event_ids` text DEFAULT '[]' NOT NULL,
	`source_memory_note_ids` text DEFAULT '[]' NOT NULL,
	`related_event_ids` text DEFAULT '[]' NOT NULL,
	`supersedes_event_ids` text DEFAULT '[]' NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`project_id`) REFERENCES `tracked_projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`source_conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_project_events_project` ON `project_events` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_events_workspace` ON `project_events` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_project_events_type` ON `project_events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_project_events_status` ON `project_events` (`status`);--> statement-breakpoint
CREATE INDEX `idx_project_events_due` ON `project_events` (`due_at`);--> statement-breakpoint
CREATE INDEX `idx_project_events_created` ON `project_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `project_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`target_at` integer,
	`completed_at` integer,
	`evidence_event_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`project_id`) REFERENCES `tracked_projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_project_milestones_project` ON `project_milestones` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_milestones_workspace` ON `project_milestones` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_project_milestones_status` ON `project_milestones` (`status`);--> statement-breakpoint
CREATE INDEX `idx_project_milestones_target` ON `project_milestones` (`target_at`);--> statement-breakpoint
CREATE TABLE `project_reminder_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`project_event_id` text,
	`scheduler_task_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'suggested' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`project_id`) REFERENCES `tracked_projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`project_event_id`) REFERENCES `project_events`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_project_reminder_links_project` ON `project_reminder_links` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_reminder_links_workspace` ON `project_reminder_links` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_project_reminder_links_task` ON `project_reminder_links` (`scheduler_task_id`);--> statement-breakpoint
CREATE INDEX `idx_project_reminder_links_status` ON `project_reminder_links` (`status`);