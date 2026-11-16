CREATE TABLE "dues_reminder_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sent_by" uuid NOT NULL,
	"due_date" date NOT NULL,
	"reminded" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dues_reminder_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dues_reminder_sends" ADD CONSTRAINT "dues_reminder_sends_sent_by_members_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;