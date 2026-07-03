CREATE TABLE `project_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text,
	`action` text NOT NULL,
	`actor` text DEFAULT 'system' NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`before` text,
	`after` text,
	`reason` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `tracked_projects`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_project_audit_workspace` ON `project_audit_logs` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_project_audit_project` ON `project_audit_logs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_project_audit_action` ON `project_audit_logs` (`action`);--> statement-breakpoint
ALTER TABLE `project_events` ADD `quality` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_events` ADD `needs_user_confirmation` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `project_events` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `project_events` ADD `reviewed_by` text;--> statement-breakpoint
CREATE INDEX `idx_project_events_quality` ON `project_events` (`quality`);--> statement-breakpoint
CREATE INDEX `idx_project_events_review` ON `project_events` (`needs_user_confirmation`,`quality`);--> statement-breakpoint
ALTER TABLE `project_reminder_links` ADD `title` text;--> statement-breakpoint
ALTER TABLE `project_reminder_links` ADD `due_at` integer;--> statement-breakpoint
ALTER TABLE `project_reminder_links` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `project_reminder_links` ADD `sync_status` text DEFAULT 'suggested' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_reminder_links` ADD `last_synced_at` integer;--> statement-breakpoint
ALTER TABLE `project_reminder_links` ADD `metadata` text;--> statement-breakpoint
CREATE INDEX `idx_project_reminder_links_due` ON `project_reminder_links` (`due_at`);--> statement-breakpoint
ALTER TABLE `tracked_projects` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `tracked_projects` ADD `merged_into_project_id` text REFERENCES tracked_projects(id);--> statement-breakpoint
ALTER TABLE `tracked_projects` ADD `split_from_project_id` text REFERENCES tracked_projects(id);--> statement-breakpoint
ALTER TABLE `tracked_projects` ADD `privacy_settings` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_projects` ADD `completion_summary` text;--> statement-breakpoint
ALTER TABLE `tracked_projects` ADD `retrospective` text;--> statement-breakpoint
ALTER TABLE `tracked_projects` ADD `memory_promotion_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_projects` ADD `promoted_memory_note_id` text REFERENCES memory_notes(id);--> statement-breakpoint
CREATE INDEX `idx_tracked_projects_deleted` ON `tracked_projects` (`workspace_id`,`deleted_at`);