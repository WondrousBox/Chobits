CREATE TABLE `ai_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`trace_id` text NOT NULL,
	`parent_event_id` text,
	`request_id` text NOT NULL,
	`provider_request_id` text,
	`event_fingerprint` text NOT NULL,
	`operation_key` text NOT NULL,
	`attempt_index` integer DEFAULT 0 NOT NULL,
	`conversation_id` text,
	`resource_id` text,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_label` text,
	`usage_category` text NOT NULL,
	`usage_feature` text NOT NULL,
	`usage_stage` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_preset_id` text,
	`model` text NOT NULL,
	`agent_id` text,
	`status` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`cache_read_tokens` integer,
	`cache_write_tokens` integer,
	`reasoning_tokens` integer,
	`total_tokens` integer,
	`billable_input_tokens` integer,
	`billable_output_tokens` integer,
	`billable_total_tokens` integer,
	`estimated_cost` real,
	`metering_source` text NOT NULL,
	`metering_accuracy` text NOT NULL,
	`billing_eligible` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`metadata` text,
	`raw_usage` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ai_usage_provider_req` ON `ai_usage_events` (`provider_id`,`provider_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ai_usage_fingerprint` ON `ai_usage_events` (`event_fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_workspace_created` ON `ai_usage_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_provider_created` ON `ai_usage_events` (`provider_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_model_created` ON `ai_usage_events` (`model`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_category_created` ON `ai_usage_events` (`usage_category`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_feature_created` ON `ai_usage_events` (`usage_feature`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_source_created` ON `ai_usage_events` (`source_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_request` ON `ai_usage_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_trace` ON `ai_usage_events` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_conversation` ON `ai_usage_events` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_resource` ON `ai_usage_events` (`resource_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_operation` ON `ai_usage_events` (`operation_key`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_status_created` ON `ai_usage_events` (`status`,`created_at`);