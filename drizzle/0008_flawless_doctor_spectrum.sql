CREATE TABLE `folder_thumbnail` (
	`folder_id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`thumbnail_link` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
