CREATE TABLE `image_thumbnail_cache` (
	`file_id` text PRIMARY KEY NOT NULL,
	`base64` text NOT NULL,
	`generated_at` integer NOT NULL
);
