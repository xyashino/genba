ALTER TABLE `orders` ADD `reset_worktree` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_steps` ADD `feedback` text;
--> statement-breakpoint
ALTER TABLE `jobs` ADD `summary` text;
