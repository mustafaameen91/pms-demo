ALTER TABLE "expenses" ADD COLUMN "loan_id" text;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_loan_idx" ON "expenses" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loans_project_idx" ON "loans" USING btree ("project_id");