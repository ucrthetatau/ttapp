CREATE TABLE "notification_prompt" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_prompt_one_row" CHECK ("notification_prompt"."id" = 1),
	CONSTRAINT "notification_prompt_version_positive" CHECK ("notification_prompt"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "notification_prompt" ENABLE ROW LEVEL SECURITY;