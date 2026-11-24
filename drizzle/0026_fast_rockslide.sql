CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#4F46E5' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"doc_number" text,
	"issue_date" date,
	"expiry_date" date,
	"file_path" text,
	"file_name" text,
	"file_type" text,
	"note" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"number" integer NOT NULL,
	"user_id" text,
	"resource_id" text,
	"name" text NOT NULL,
	"name_alt" text,
	"photo_path" text,
	"photo_type" text,
	"job_title" text,
	"department_id" text,
	"manager_id" text,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"work_location" text,
	"hire_date" date,
	"probation_end_date" date,
	"contract_end_date" date,
	"end_date" date,
	"end_reason" text,
	"birth_date" date,
	"gender" text,
	"nationality" text,
	"national_id" text,
	"marital_status" text,
	"phone" text,
	"email" text,
	"address" text,
	"emergency_name" text,
	"emergency_phone" text,
	"pay_basis" text DEFAULT 'monthly' NOT NULL,
	"basic_pay" numeric(14, 2),
	"allowances" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"bank_name" text,
	"bank_account" text,
	"notes" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_not_own_manager" CHECK ("employees"."manager_id" is null or "employees"."manager_id" <> "employees"."id")
);
--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_employees_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "departments_workspace_name_uidx" ON "departments" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "employee_documents_employee_idx" ON "employee_documents" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_documents_expiry_idx" ON "employee_documents" USING btree ("workspace_id","expiry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_number_uidx" ON "employees" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_user_uidx" ON "employees" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_resource_uidx" ON "employees" USING btree ("workspace_id","resource_id");--> statement-breakpoint
CREATE INDEX "employees_workspace_idx" ON "employees" USING btree ("workspace_id","end_date");--> statement-breakpoint
CREATE INDEX "employees_manager_idx" ON "employees" USING btree ("manager_id");