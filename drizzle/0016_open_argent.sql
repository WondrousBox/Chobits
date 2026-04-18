ALTER TABLE `rss_feed_items` ADD `download_error_code` text;--> statement-breakpoint
ALTER TABLE `rss_feed_items` ADD `download_error` text;--> statement-breakpoint
ALTER TABLE `rss_feed_items` ADD `download_error_at` integer;--> statement-breakpoint
ALTER TABLE `rss_feed_items` ADD `last_download_at` integer;