CREATE TYPE "public"."recurrence" AS ENUM('daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence" "recurrence";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence_next_id" text;