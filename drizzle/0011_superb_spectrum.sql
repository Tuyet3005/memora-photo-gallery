CREATE TABLE `folder_note` (
	`folder_id` text PRIMARY KEY NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
