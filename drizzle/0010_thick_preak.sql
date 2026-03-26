CREATE TABLE `memory_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`weight` real DEFAULT 1,
	`evidence_note_id` text,
	`evidence_snippet` text,
	`origin` text DEFAULT 'llm_extracted',
	`workspace_id` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_mem_edges_source` ON `memory_edges` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_edges_target` ON `memory_edges` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_edges_relation` ON `memory_edges` (`relation_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_edges_link` ON `memory_edges` (`source_type`,`source_id`,`target_type`,`target_id`,`relation_type`);--> statement-breakpoint
CREATE INDEX `idx_mem_edges_workspace` ON `memory_edges` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `memory_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical` text NOT NULL,
	`aliases` text,
	`language` text,
	`entity_type` text DEFAULT 'keyword',
	`primary_topic_id` text,
	`occurrence_count` integer DEFAULT 0,
	`last_seen_at` integer,
	`workspace_id` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`primary_topic_id`) REFERENCES `memory_topics`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_keywords_canonical_ws` ON `memory_keywords` (`canonical`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_keywords_entity_type` ON `memory_keywords` (`entity_type`);--> statement-breakpoint
CREATE INDEX `idx_mem_keywords_topic` ON `memory_keywords` (`primary_topic_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_keywords_workspace` ON `memory_keywords` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_keywords_occurrence` ON `memory_keywords` (`occurrence_count`);--> statement-breakpoint
CREATE TABLE `memory_note_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`keyword_id` text NOT NULL,
	`scope` text DEFAULT 'note',
	`section_id` text,
	`relevance` real DEFAULT 1,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`note_id`) REFERENCES `memory_notes`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`keyword_id`) REFERENCES `memory_keywords`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `memory_sections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_note_keyword` ON `memory_note_keywords` (`note_id`,`keyword_id`,`section_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_note_keywords_note` ON `memory_note_keywords` (`note_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_note_keywords_keyword` ON `memory_note_keywords` (`keyword_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_note_keywords_section` ON `memory_note_keywords` (`section_id`);--> statement-breakpoint
CREATE TABLE `memory_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`workspace_id` text,
	`date` text NOT NULL,
	`time_range_start` integer,
	`time_range_end` integer,
	`file_path` text NOT NULL,
	`file_checksum` text,
	`topics` text NOT NULL,
	`parent_topic_id` text,
	`related_topic_ids` text,
	`keywords` text NOT NULL,
	`aliases` text,
	`entities` text,
	`summary` text NOT NULL,
	`source_conversation_ids` text NOT NULL,
	`source_message_range` text,
	`importance` real DEFAULT 0.5 NOT NULL,
	`stability` real DEFAULT 0.5 NOT NULL,
	`section_count` integer DEFAULT 0,
	`char_count` integer DEFAULT 0,
	`token_estimate` integer DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`parent_topic_id`) REFERENCES `memory_topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_mem_notes_workspace` ON `memory_notes` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_notes_date` ON `memory_notes` (`date`);--> statement-breakpoint
CREATE INDEX `idx_mem_notes_importance` ON `memory_notes` (`importance`);--> statement-breakpoint
CREATE INDEX `idx_mem_notes_stability` ON `memory_notes` (`stability`);--> statement-breakpoint
CREATE INDEX `idx_mem_notes_parent_topic` ON `memory_notes` (`parent_topic_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_notes_created` ON `memory_notes` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mem_notes_deleted` ON `memory_notes` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_notes_file_path` ON `memory_notes` (`file_path`);--> statement-breakpoint
CREATE TABLE `memory_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`heading` text NOT NULL,
	`heading_level` integer NOT NULL,
	`section_order` integer NOT NULL,
	`summary` text,
	`keywords` text,
	`line_start` integer NOT NULL,
	`line_end` integer NOT NULL,
	`char_count` integer DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`note_id`) REFERENCES `memory_notes`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mem_sections_note` ON `memory_sections` (`note_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_sections_heading` ON `memory_sections` (`heading`);--> statement-breakpoint
CREATE INDEX `idx_mem_sections_order` ON `memory_sections` (`note_id`,`section_order`);--> statement-breakpoint
CREATE TABLE `memory_sync_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_type` text NOT NULL,
	`workspace_id` text,
	`target_date` text,
	`target_conversation_ids` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`progress` text,
	`error_message` text,
	`notes_created` integer DEFAULT 0,
	`notes_updated` integer DEFAULT 0,
	`topics_created` integer DEFAULT 0,
	`edges_created` integer DEFAULT 0,
	`keywords_created` integer DEFAULT 0,
	`provider_id` text,
	`model` text,
	`tokens_used` integer DEFAULT 0,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_mem_sync_jobs_status` ON `memory_sync_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_mem_sync_jobs_type` ON `memory_sync_jobs` (`job_type`);--> statement-breakpoint
CREATE INDEX `idx_mem_sync_jobs_workspace` ON `memory_sync_jobs` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_sync_jobs_date` ON `memory_sync_jobs` (`target_date`);--> statement-breakpoint
CREATE INDEX `idx_mem_sync_jobs_created` ON `memory_sync_jobs` (`created_at`);--> statement-breakpoint
CREATE TABLE `memory_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`slug` text NOT NULL,
	`aliases` text,
	`description` text,
	`parent_id` text,
	`keywords` text,
	`workspace_id` text,
	`note_count` integer DEFAULT 0,
	`heat` real DEFAULT 0,
	`centrality_hint` real DEFAULT 0,
	`first_seen_at` integer,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000),
	`deleted_at` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `memory_topics`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_topics_slug_ws` ON `memory_topics` (`slug`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_topics_label` ON `memory_topics` (`label`);--> statement-breakpoint
CREATE INDEX `idx_mem_topics_parent` ON `memory_topics` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_topics_workspace` ON `memory_topics` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_mem_topics_heat` ON `memory_topics` (`heat`);--> statement-breakpoint
CREATE INDEX `idx_mem_topics_last_seen` ON `memory_topics` (`last_seen_at`);--> statement-breakpoint
DROP INDEX `idx_chat_messages_conv_seq`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_chat_messages_conv_seq` ON `chat_messages` (`conversation_id`,`seq`);