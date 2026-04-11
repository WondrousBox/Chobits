ALTER TABLE `memory_edges` ADD `valid_from` integer;--> statement-breakpoint
ALTER TABLE `memory_edges` ADD `valid_to` integer;--> statement-breakpoint
ALTER TABLE `memory_edges` ADD `confidence` real DEFAULT 1;--> statement-breakpoint
CREATE INDEX `idx_mem_edges_valid` ON `memory_edges` (`valid_from`,`valid_to`);--> statement-breakpoint
ALTER TABLE `memory_topics` ADD `domain` text;--> statement-breakpoint
ALTER TABLE `memory_topics` ADD `domain_type` text;--> statement-breakpoint
CREATE INDEX `idx_mem_topics_domain` ON `memory_topics` (`domain`,`workspace_id`);