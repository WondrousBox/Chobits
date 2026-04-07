DROP INDEX `uq_mem_notes_file_path`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_mem_notes_workspace_file_path` ON `memory_notes` (`workspace_id`,`file_path`);