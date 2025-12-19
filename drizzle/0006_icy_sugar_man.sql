ALTER TABLE `resources` ADD `parent_resource_id` text REFERENCES resources(id);--> statement-breakpoint
CREATE INDEX `idx_resources_parent` ON `resources` (`parent_resource_id`);