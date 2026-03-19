PRAGMA foreign_keys=OFF;--> statement-breakpoint

DELETE FROM `signed_upload`;--> statement-breakpoint

CREATE TABLE `__new_signed_upload` (
	`id` text PRIMARY KEY NOT NULL,
	`file_size` integer NOT NULL,
	`resumable_uri` text NOT NULL,
	`created_at` integer NOT NULL
);--> statement-breakpoint

DROP TABLE `signed_upload`;--> statement-breakpoint

ALTER TABLE `__new_signed_upload` RENAME TO `signed_upload`;--> statement-breakpoint

PRAGMA foreign_keys=ON;