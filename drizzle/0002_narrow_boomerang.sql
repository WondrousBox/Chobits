CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`name` text,
	`tool_call_id` text,
	`seq` integer NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	`deleted_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_conv_seq` ON `chat_messages` (`conversation_id`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_chat_messages_conv_created` ON `chat_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`workspace_id` text,
	`agent_id` text,
	`provider_id` text,
	`provider_instance_id` text,
	`messages_count` integer DEFAULT 0,
	`last_message_at` integer,
	`pinned` integer,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_updated` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_last_msg` ON `conversations` (`last_message_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_workspace` ON `conversations` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_deleted` ON `conversations` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_pinned` ON `conversations` (`pinned`);