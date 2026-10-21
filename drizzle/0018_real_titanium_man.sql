CREATE TABLE "site_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"date" date NOT NULL,
	"weather" text,
	"temperature" integer,
	"deliveries" text,
	"problems" text,
	"notes" text,
	"created_by_id" text,
	"updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"date" date NOT NULL,
	"user_id" text,
	"resource_id" text,
	"project_resource_id" text,
	"task_id" text,
	"quantity" numeric(8, 2) NOT NULL,
	"unit" text NOT NULL,
	"note" text,
	"status" "approval_status" DEFAULT 'approved' NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_one_person" CHECK (("time_entries"."user_id" is null) <> ("time_entries"."resource_id" is null)),
	CONSTRAINT "time_entries_quantity_positive" CHECK ("time_entries"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "project_resources" ADD COLUMN "from_timesheets" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_resources" ADD COLUMN "used_qty_base" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_logs" ADD CONSTRAINT "site_logs_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_logs" ADD CONSTRAINT "site_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_logs" ADD CONSTRAINT "site_logs_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_logs" ADD CONSTRAINT "site_logs_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_resource_id_project_resources_id_fk" FOREIGN KEY ("project_resource_id") REFERENCES "public"."project_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_logs_project_date_uidx" ON "site_logs" USING btree ("project_id","date");--> statement-breakpoint
CREATE INDEX "time_entries_project_date_idx" ON "time_entries" USING btree ("project_id","date");--> statement-breakpoint
CREATE INDEX "time_entries_user_idx" ON "time_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "time_entries_resource_idx" ON "time_entries" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "time_entries_usage_idx" ON "time_entries" USING btree ("project_resource_id");