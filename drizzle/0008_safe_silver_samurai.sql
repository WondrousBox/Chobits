CREATE TABLE `rss_feed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`rss_resource_id` text NOT NULL,
	`item_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`link` text NOT NULL,
	`published_at` integer NOT NULL,
	`updated_at` integer,
	`author` text,
	`thumbnail` text,
	`duration_ms` integer,
	`view_count` integer,
	`like_count` integer,
	`comment_count` integer,
	`media_type` text,
	`media_url` text,
	`media_format` text,
	`size_bytes` integer,
	`categories` text,
	`downloaded` integer DEFAULT false,
	`local_resource_id` text,
	`download_status` text,
	`download_progress` integer,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch('now')*1000),
	`deleted_at` integer,
	FOREIGN KEY (`rss_resource_id`) REFERENCES `resources`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`local_resource_id`) REFERENCES `resources`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_rss_feed_items_resource` ON `rss_feed_items` (`rss_resource_id`);--> statement-breakpoint
CREATE INDEX `idx_rss_feed_items_published` ON `rss_feed_items` (`published_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rss_feed_items_resource_item` ON `rss_feed_items` (`rss_resource_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `idx_rss_feed_items_downloaded` ON `rss_feed_items` (`downloaded`);