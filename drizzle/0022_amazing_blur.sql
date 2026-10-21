CREATE TABLE "project_file_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"file_id" text NOT NULL,
	"version" integer NOT NULL,
	"path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"note" text,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"task_id" text,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"description" text,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_file_versions" ADD CONSTRAINT "project_file_versions_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_file_versions" ADD CONSTRAINT "project_file_versions_file_id_project_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."project_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_file_versions" ADD CONSTRAINT "project_file_versions_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_file_versions_uidx" ON "project_file_versions" USING btree ("file_id","version");--> statement-breakpoint
CREATE INDEX "project_files_project_idx" ON "project_files" USING btree ("project_id","category");--> statement-breakpoint
CREATE INDEX "project_files_task_idx" ON "project_files" USING btree ("task_id");