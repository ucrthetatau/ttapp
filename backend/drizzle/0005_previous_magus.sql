CREATE TABLE "meeting_headcount" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"present_count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_headcount_one_row" CHECK ("meeting_headcount"."id" = 1),
	CONSTRAINT "meeting_headcount_positive" CHECK ("meeting_headcount"."present_count" >= 1)
);
--> statement-breakpoint
ALTER TABLE "meeting_headcount" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "can_vote" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- kind and present_count are NOT NULL, but a vote may already exist from before this change.
-- So: add them empty, fill any existing rows (kind majority; present count = how many
-- answered, at least 1), then make them required.
ALTER TABLE "votes" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "present_count" integer;--> statement-breakpoint
UPDATE "votes" SET "kind" = 'majority', "present_count" = GREATEST(1, (SELECT count(*) FROM "vote_responses" WHERE "vote_responses"."vote_id" = "votes"."id"));--> statement-breakpoint
ALTER TABLE "votes" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ALTER COLUMN "present_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "tiebreak" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_kind_valid" CHECK ("votes"."kind" in ('majority', 'discussion', 'midway', 'overturn_midway', 'final', 'overturn_final'));--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_present_count_positive" CHECK ("votes"."present_count" >= 1);