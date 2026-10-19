CREATE TYPE "public"."approval_status" AS ENUM('approved', 'pending', 'rejected');--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "approval_status" "approval_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "decided_by_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "decision_note" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "approval_threshold" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;