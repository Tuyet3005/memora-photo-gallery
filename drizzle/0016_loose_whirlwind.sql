PRAGMA foreign_keys=OFF;--> statement-breakpoint

CREATE TABLE `__new_signed_upload` (
	`id` text PRIMARY KEY NOT NULL,
	`file_size` integer,
	`resumable_uri` text,
	`created_at` integer NOT NULL
);--> statement-breakpoint

INSERT INTO `__new_signed_upload` (`id`, `file_size`, `resumable_uri`, `created_at`)
SELECT `id`, `file_size`, `resumable_uri`, `created_at`
FROM `signed_upload`;--> statement-breakpoint

DROP TABLE `signed_upload`;--> statement-breakpoint

ALTER TABLE `__new_signed_upload` RENAME TO `signed_upload`;--> statement-breakpoint

PRAGMA foreign_keys=ON;