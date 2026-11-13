CREATE TABLE "dashboard_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"google_id" text NOT NULL,
	"tab_gid" integer,
	"threshold" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_sources_kind" CHECK ("dashboard_sources"."kind" in ('dues', 'requirements', 'calendar')),
	CONSTRAINT "dashboard_sources_tab" CHECK (("dashboard_sources"."kind" = 'calendar') = ("dashboard_sources"."tab_gid" is null)),
	CONSTRAINT "dashboard_sources_threshold" CHECK (("dashboard_sources"."kind" = 'requirements') = ("dashboard_sources"."threshold" is not null) and ("dashboard_sources"."threshold" is null or "dashboard_sources"."threshold" between 0 and 100))
);
--> statement-breakpoint
ALTER TABLE "dashboard_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_sources_one_sheet" ON "dashboard_sources" USING btree ("kind") WHERE "dashboard_sources"."kind" in ('dues', 'requirements');--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_sources_calendar_once" ON "dashboard_sources" USING btree ("google_id") WHERE "dashboard_sources"."kind" = 'calendar';