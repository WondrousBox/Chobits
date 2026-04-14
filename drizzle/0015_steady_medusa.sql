CREATE TABLE `ai_usage_event_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`event_fingerprint` text NOT NULL,
	`producer` text,
	`trace_id` text NOT NULL,
	`request_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`usage_feature` text NOT NULL,
	`usage_stage` text NOT NULL,
	`operation_key` text NOT NULL,
	`attempt_index` integer DEFAULT 0 NOT NULL,
	`emitted_at` integer NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`last_attempt_at` integer,
	`processed_at` integer,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`updated_at` integer DEFAULT (unixepoch('now')*1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ai_usage_outbox_event_fingerprint` ON `ai_usage_event_outbox` (`event_type`,`event_fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_outbox_status_created` ON `ai_usage_event_outbox` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_outbox_fingerprint` ON `ai_usage_event_outbox` (`event_fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_outbox_trace` ON `ai_usage_event_outbox` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_outbox_request` ON `ai_usage_event_outbox` (`request_id`);