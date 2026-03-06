CREATE TABLE `upload_delegation` (
	`id` text PRIMARY KEY NOT NULL,
	`grantor_id` text NOT NULL,
	`grantee_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`grantor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grantee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user` ADD `upload_delegation_id` text;