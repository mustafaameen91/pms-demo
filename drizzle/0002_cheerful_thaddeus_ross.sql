ALTER TABLE "tasks" ADD COLUMN "weight" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "budget" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "deleted_at" timestamp with time zone;