PRAGMA foreign_keys=OFF;--> statement-breakpoint
UPDATE `workflows`
SET `workspace_id` = (SELECT `id` FROM `workspaces` WHERE `is_default` = 1 AND (`deleted_at` IS NULL OR `deleted_at` = 0) LIMIT 1)
WHERE `workspace_id` IS NULL
  AND EXISTS (SELECT 1 FROM `workspaces` WHERE `is_default` = 1 AND (`deleted_at` IS NULL OR `deleted_at` = 0));--> statement-breakpoint
CREATE TABLE `__new_workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text,
	`workspace_id` text,
	`status` text NOT NULL,
	`input` text,
	`output` text,
	`error` text,
	`nodes` text,
	`metadata` text,
	`duration` integer,
	`started_at` integer DEFAULT (unixepoch('now')*1000),
	`completed_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workflow_runs`("id", "workflow_id", "workspace_id", "status", "input", "output", "error", "nodes", "metadata", "duration", "started_at", "completed_at")
SELECT
	`id`,
	`workflow_id`,
	COALESCE(
		(SELECT `workspace_id` FROM `workflows` WHERE `workflows`.`id` = `workflow_runs`.`workflow_id`),
		CASE WHEN json_valid(`metadata`) THEN json_extract(`metadata`, '$.workspaceId') END,
		(SELECT `id` FROM `workspaces` WHERE `is_default` = 1 AND (`deleted_at` IS NULL OR `deleted_at` = 0) LIMIT 1)
	),
	`status`,
	`input`,
	`output`,
	`error`,
	`nodes`,
	`metadata`,
	`duration`,
	`started_at`,
	`completed_at`
FROM `workflow_runs`;--> statement-breakpoint
DROP TABLE `workflow_runs`;--> statement-breakpoint
ALTER TABLE `__new_workflow_runs` RENAME TO `workflow_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflow` ON `workflow_runs` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workspace` ON `workflow_runs` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_status` ON `workflow_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_started` ON `workflow_runs` (`started_at`);
