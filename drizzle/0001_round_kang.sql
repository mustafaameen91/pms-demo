CREATE TYPE "public"."project_status" AS ENUM('planning', 'active', 'on_hold', 'completed', 'cancelled');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status" "project_status" DEFAULT 'planning' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "client" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "budget" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;