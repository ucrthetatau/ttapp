ALTER TABLE "posts" DROP CONSTRAINT "posts_body_not_blank";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_has_content" CHECK (length(trim("posts"."body")) > 0 or ("posts"."title" is not null and length(trim("posts"."title")) > 0));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_title_ok" CHECK ("posts"."title" is null or (length(trim("posts"."title")) > 0 and length("posts"."title") <= 80));