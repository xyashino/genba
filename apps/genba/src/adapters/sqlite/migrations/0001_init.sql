CREATE TABLE `orders` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `line` text NOT NULL,
  `priority` text NOT NULL,
  `status` text NOT NULL,
  `parent_slug` text,
  `plan_id` text,
  `pr_url` text,
  `pr_number` integer,
  `pr_outcome` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `started_at` text,
  `delivered_at` text,
  `merged_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_slug_unique` ON `orders` (`slug`);
--> statement-breakpoint
CREATE INDEX `orders_status_index` ON `orders` (`status`);
--> statement-breakpoint
CREATE TABLE `order_steps` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL REFERENCES `orders` (`id`) ON DELETE cascade,
  `station_id` text NOT NULL,
  `status` text NOT NULL,
  `attempts_used` integer DEFAULT 0 NOT NULL,
  `max_attempts` integer NOT NULL,
  `started_at` text,
  `finished_at` text
);
--> statement-breakpoint
CREATE INDEX `order_steps_order_index` ON `order_steps` (`order_id`);
--> statement-breakpoint
CREATE TABLE `jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL REFERENCES `orders` (`id`) ON DELETE cascade,
  `step_id` text NOT NULL REFERENCES `order_steps` (`id`) ON DELETE cascade,
  `cell_id` text NOT NULL,
  `station_id` text NOT NULL,
  `attempt` integer NOT NULL,
  `status` text NOT NULL,
  `runner` text,
  `model` text,
  `tier` text,
  `duration_ms` integer,
  `started_at` text NOT NULL,
  `finished_at` text
);
--> statement-breakpoint
CREATE INDEX `jobs_order_index` ON `jobs` (`order_id`);
--> statement-breakpoint
CREATE INDEX `jobs_started_index` ON `jobs` (`started_at`);
--> statement-breakpoint
CREATE TABLE `incidents` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL REFERENCES `orders` (`id`) ON DELETE cascade,
  `step_id` text REFERENCES `order_steps` (`id`) ON DELETE set null,
  `reason` text NOT NULL,
  `triage_owner` text NOT NULL,
  `summary` text NOT NULL,
  `diagnosis` text,
  `issue_url` text,
  `draft_pr_url` text,
  `resolution` text,
  `created_at` text NOT NULL,
  `resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `incidents_order_index` ON `incidents` (`order_id`);
