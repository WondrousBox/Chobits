CREATE TABLE `conversation_route_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`conversation_id` text NOT NULL,
	`seq_start` integer NOT NULL,
	`seq_end` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`evidence` text,
	`status` text DEFAULT 'active' NOT NULL,
	`importance` real DEFAULT 0.5 NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`tags` text,
	`related_event_ids` text,
	`resolves_event_ids` text,
	`supersedes_event_ids` text,
	`promoted_memory_note_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`promoted_memory_note_id`) REFERENCES `memory_notes`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_conv_route_events_conversation_seq` ON `conversation_route_events` (`conversation_id`,`seq_start`,`seq_end`);--> statement-breakpoint
CREATE INDEX `idx_conv_route_events_workspace` ON `conversation_route_events` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_conv_route_events_type` ON `conversation_route_events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_conv_route_events_status` ON `conversation_route_events` (`status`);--> statement-breakpoint
CREATE INDEX `idx_conv_route_events_importance` ON `conversation_route_events` (`importance`);--> statement-breakpoint
CREATE TABLE `conversation_route_snapshots` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`last_processed_seq` integer DEFAULT 0 NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`current_goal` text,
	`current_topic` text,
	`next_suggested_focus` text,
	`active_threads` text DEFAULT '[]' NOT NULL,
	`open_tasks` text DEFAULT '[]' NOT NULL,
	`resolved_tasks` text DEFAULT '[]' NOT NULL,
	`key_constraints` text DEFAULT '[]' NOT NULL,
	`user_corrections` text DEFAULT '[]' NOT NULL,
	`key_clues` text DEFAULT '[]' NOT NULL,
	`decisions` text DEFAULT '[]' NOT NULL,
	`blockers` text DEFAULT '[]' NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_conv_route_snapshots_workspace` ON `conversation_route_snapshots` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_conv_route_snapshots_updated` ON `conversation_route_snapshots` (`updated_at`);