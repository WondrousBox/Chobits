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
CREATE INDEX `idx_conversations_pinned` ON `conversations` (`pinned`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`embedding` blob,
	`title` text,
	`language` text,
	`tags` text,
	`source_id` text,
	`doc_type` text,
	`parent_id` text,
	`chunk_index` integer,
	`chunk_count` integer,
	`checksum` text,
	`content_tokens` integer,
	`embed_model` text,
	`embed_dim` integer,
	`embed_at` integer,
	`status` text,
	`visibility` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	`deleted_at` integer,
	`content_path` text,
	`workspace_id` text,
	FOREIGN KEY (`source_id`) REFERENCES `resources`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_documents_source` ON `documents` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_documents_parent` ON `documents` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_documents_doc_parent_chunk` ON `documents` (`doc_type`,`parent_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `idx_documents_created` ON `documents` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_documents_status` ON `documents` (`status`);--> statement-breakpoint
CREATE INDEX `idx_documents_visibility` ON `documents` (`visibility`);--> statement-breakpoint
CREATE INDEX `idx_documents_checksum` ON `documents` (`checksum`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_documents_checksum_parent` ON `documents` (`checksum`,`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_documents_workspace` ON `documents` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parent_id` text,
	`workspace_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	`deleted_at` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_folders_parent` ON `folders` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_folders_workspace` ON `folders` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_folders_ws_parent_name` ON `folders` (`workspace_id`,`parent_id`,`name`);--> statement-breakpoint
CREATE TABLE `recycle_bin` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`title` text,
	`summary` text,
	`reason` text,
	`deleted_at` integer,
	`deleted_by` text,
	`payload` text,
	`expire_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_recycle_entity` ON `recycle_bin` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_recycle_deleted_at` ON `recycle_bin` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_recycle_expire_at` ON `recycle_bin` (`expire_at`);--> statement-breakpoint
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
CREATE INDEX `idx_resource_tags_workspace` ON `resource_tags` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text,
	`description` text,
	`url` text,
	`domain` text,
	`source_name` text,
	`author_name` text,
	`language` text,
	`mime_type` text,
	`size_bytes` integer,
	`duration_ms` integer,
	`width` integer,
	`height` integer,
	`file_path` text,
	`content_text` text,
	`thumbnail` blob,
	`thumbnail_path` text,
	`preview_url` text,
	`tags` text,
	`categories` text,
	`visibility` text,
	`nsfw` integer,
	`favorite` integer,
	`rating` integer,
	`status` text,
	`collected_at` integer,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	`deleted_at` integer,
	`metadata` text,
	`embedding` blob,
	`workspace_id` text,
	`folder_id` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_resources_workspace` ON `resources` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_resources_folder` ON `resources` (`folder_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`root_path` text NOT NULL,
	`description` text,
	`is_default` integer,
	`status` text,
	`size_bytes` integer,
	`file_count` integer,
	`last_scan_at` integer,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_workspaces_root_path` ON `workspaces` (`root_path`);--> statement-breakpoint
CREATE INDEX `idx_workspaces_is_default` ON `workspaces` (`is_default`);--> statement-breakpoint
CREATE INDEX `idx_workspaces_deleted_at` ON `workspaces` (`deleted_at`);