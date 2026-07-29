CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contact_events` (
	`id` text PRIMARY KEY NOT NULL,
	`professor_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_date` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`attachments` text DEFAULT '' NOT NULL,
	`status_after` text DEFAULT '' NOT NULL,
	`next_action_date` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`professor_id`) REFERENCES `professors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`intake_year` integer NOT NULL,
	`round` text DEFAULT '一般選抜' NOT NULL,
	`method` text DEFAULT '一般入試' NOT NULL,
	`guidelines_url` text DEFAULT '' NOT NULL,
	`application_start` text DEFAULT '' NOT NULL,
	`application_end` text DEFAULT '' NOT NULL,
	`exam_start` text DEFAULT '' NOT NULL,
	`exam_end` text DEFAULT '' NOT NULL,
	`written` text DEFAULT '' NOT NULL,
	`oral` text DEFAULT '' NOT NULL,
	`language` text DEFAULT '' NOT NULL,
	`pre_contact` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '待确认' NOT NULL,
	`official_source` text DEFAULT '' NOT NULL,
	`verified_at` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exams_unique` ON `exams` (`school_id`,`intake_year`,`round`);--> statement-breakpoint
CREATE TABLE `professors` (
	`id` text PRIMARY KEY NOT NULL,
	`university` text NOT NULL,
	`graduate_school` text DEFAULT '' NOT NULL,
	`lab` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`title` text DEFAULT '教授' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`lab_url` text DEFAULT '' NOT NULL,
	`research` text DEFAULT '' NOT NULL,
	`fit` text DEFAULT '' NOT NULL,
	`identity` text DEFAULT '' NOT NULL,
	`system_status` text DEFAULT '' NOT NULL,
	`language_status` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'B' NOT NULL,
	`risk` text DEFAULT '' NOT NULL,
	`gmail_thread_id` text DEFAULT '' NOT NULL,
	`current_status` text DEFAULT '候选' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `professors_unique` ON `professors` (`university`,`name`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`education` text DEFAULT '' NOT NULL,
	`gpa` text DEFAULT '' NOT NULL,
	`language` text DEFAULT '' NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`research_topic` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`university` text NOT NULL,
	`nature` text DEFAULT '国立' NOT NULL,
	`graduate_school` text NOT NULL,
	`major` text NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '主申' NOT NULL,
	`priority` text DEFAULT 'A' NOT NULL,
	`fit` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schools_program_unique` ON `schools` (`university`,`graduate_school`,`major`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`name` text NOT NULL,
	`requirement` text DEFAULT '必考' NOT NULL,
	`mastery` text DEFAULT '未评估' NOT NULL,
	`progress` text DEFAULT '未开始' NOT NULL,
	`past_questions_url` text DEFAULT '' NOT NULL,
	`reference_book` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '待处理' NOT NULL,
	`related_school_id` text DEFAULT '' NOT NULL,
	`related_professor_id` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`event_date` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`related_school_id` text DEFAULT '' NOT NULL,
	`related_professor_id` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
