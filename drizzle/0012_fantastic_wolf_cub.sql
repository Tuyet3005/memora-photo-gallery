ALTER TABLE `folder_thumbnail` RENAME TO `folder_metadata`;--> statement-breakpoint
ALTER TABLE `folder_metadata` RENAME COLUMN "file_id" TO "thumbnail_file_id";