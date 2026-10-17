CREATE TYPE "public"."resource_type" AS ENUM('material', 'equipment', 'labor', 'supplier');--> statement-breakpoint
CREATE TABLE "project_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"task_id" text,
	"planned_qty" numeric(14, 2) DEFAULT '0' NOT NULL,
	"used_qty" numeric(14, 2) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type" "resource_type" NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"unit_cost" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"role" text,
	"phone" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_resources_project_idx" ON "project_resources" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_resources_resource_idx" ON "project_resources" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "project_resources_task_idx" ON "project_resources" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "resources_workspace_idx" ON "resources" USING btree ("workspace_id","type");