CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`exam_date` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `papers_user_updated_idx` ON `papers` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`number` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`answer_text` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '' NOT NULL,
	`question_image_key` text,
	`answer_image_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `questions_user_paper_idx` ON `questions` (`user_id`,`paper_id`);--> statement-breakpoint
CREATE INDEX `questions_user_updated_idx` ON `questions` (`user_id`,`updated_at`);