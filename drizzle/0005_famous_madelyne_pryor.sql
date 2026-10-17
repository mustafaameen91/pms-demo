ALTER TABLE "comments" ADD COLUMN "mentions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "type" text DEFAULT 'activity' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uidx" ON "notifications" USING btree ("user_id","dedupe_key");