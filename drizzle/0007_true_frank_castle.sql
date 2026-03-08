CREATE TABLE `image_original_version` (
	`file_id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`rotation_deg` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
