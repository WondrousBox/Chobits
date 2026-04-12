ALTER TABLE `memory_notes` ADD `domain` text;--> statement-breakpoint
CREATE INDEX `idx_mem_notes_domain` ON `memory_notes` (`domain`,`workspace_id`);