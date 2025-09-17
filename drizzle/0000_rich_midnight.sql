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
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_resources_workspace` ON `resources` (`workspace_id`);--> statement-breakpoint
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