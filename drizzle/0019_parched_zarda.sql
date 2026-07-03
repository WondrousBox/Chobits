CREATE TABLE `project_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`seq_start` integer NOT NULL,
	`seq_end` integer NOT NULL,
	`proposed_name` text NOT NULL,
	`proposed_goal` text NOT NULL,
	`evidence_summary` text DEFAULT '' NOT NULL,
	`evidence_message_ids` text DEFAULT '[]' NOT NULL,
	`signal_score` real DEFAULT 0 NOT NULL,
	`reasons` text DEFAULT '[]' NOT NULL,
	`suggested_milestones` text DEFAULT '[]' NOT NULL,
	`suggested_reminders` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`confirmed_project_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`confirmed_project_id`) REFERENCES `tracked_projects`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_project_candidates_workspace_status` ON `project_candidates` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_project_candidates_conversation` ON `project_candidates` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_project_candidates_expires` ON `project_candidates` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_project_candidates_score` ON `project_candidates` (`signal_score`);--> statement-breakpoint
CREATE TABLE `project_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`strength` real DEFAULT 1 NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`created_by` text DEFAULT 'system' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `tracked_projects`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_project_links_project` ON `project_links` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_links_workspace_target` ON `project_links` (`workspace_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_project_links_relation` ON `project_links` (`relation_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_project_links_project_target_relation` ON `project_links` (`project_id`,`target_type`,`target_id`,`relation_type`);--> statement-breakpoint
CREATE TABLE `project_snapshots` (
	`project_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`goal` text NOT NULL,
	`current_focus` text,
	`next_suggested_action` text,
	`upcoming_dates` text DEFAULT '[]' NOT NULL,
	`open_tasks` text DEFAULT '[]' NOT NULL,
	`recent_progress` text DEFAULT '[]' NOT NULL,
	`decisions` text DEFAULT '[]' NOT NULL,
	`agreements` text DEFAULT '[]' NOT NULL,
	`blockers` text DEFAULT '[]' NOT NULL,
	`risks` text DEFAULT '[]' NOT NULL,
	`changes` text DEFAULT '[]' NOT NULL,
	`completed_milestones` text DEFAULT '[]' NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`project_id`) REFERENCES `tracked_projects`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_project_snapshots_workspace` ON `project_snapshots` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_project_snapshots_status` ON `project_snapshots` (`status`);--> statement-breakpoint
CREATE INDEX `idx_project_snapshots_updated` ON `project_snapshots` (`updated_at`);--> statement-breakpoint
CREATE TABLE `tracked_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`goal` text NOT NULL,
	`scope` text,
	`status` text DEFAULT 'active' NOT NULL,
	`owner_user_id` text,
	`stakeholders` text DEFAULT '[]' NOT NULL,
	`domains` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`started_at` integer,
	`target_end_at` integer,
	`completed_at` integer,
	`confidence` real DEFAULT 1 NOT NULL,
	`created_by` text DEFAULT 'user' NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	`archived_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tracked_projects_workspace_status` ON `tracked_projects` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tracked_projects_workspace_updated` ON `tracked_projects` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_tracked_projects_workspace_name` ON `tracked_projects` (`workspace_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_tracked_projects_target_end` ON `tracked_projects` (`workspace_id`,`target_end_at`);