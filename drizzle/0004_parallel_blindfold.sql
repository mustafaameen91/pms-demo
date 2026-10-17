CREATE TYPE "public"."expense_category" AS ENUM('materials', 'equipment', 'labor', 'subcontractor', 'transport', 'permits_fees', 'utilities', 'other');--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"task_id" text,
	"project_resource_id" text,
	"date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"category" "expense_category" DEFAULT 'other' NOT NULL,
	"description" text NOT NULL,
	"payee" text,
	"receipt_path" text,
	"receipt_name" text,
	"receipt_type" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_resource_id_project_resources_id_fk" FOREIGN KEY ("project_resource_id") REFERENCES "public"."project_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_project_idx" ON "expenses" USING btree ("project_id","date");--> statement-breakpoint
CREATE INDEX "expenses_task_idx" ON "expenses" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "expenses_resource_idx" ON "expenses" USING btree ("project_resource_id");