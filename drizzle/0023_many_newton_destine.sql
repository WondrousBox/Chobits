DROP TABLE `workspaces`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`agent_id` text,
	`provider_id` text,
	`provider_preset_id` text,
	`messages_count` integer DEFAULT 0,
	`last_message_at` integer,
	`pinned` integer,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	`deleted_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("id", "title", "agent_id", "provider_id", "provider_preset_id", "messages_count", "last_message_at", "pinned", "metadata", "created_at", "updated_at", "deleted_at") SELECT "id", "title", "agent_id", "provider_id", "provider_preset_id", "messages_count", "last_message_at", "pinned", "metadata", "created_at", "updated_at", "deleted_at" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_conversations_updated` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_last_msg` ON `conversations` (`last_message_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_deleted` ON `conversations` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_pinned` ON `conversations` (`pinned`);