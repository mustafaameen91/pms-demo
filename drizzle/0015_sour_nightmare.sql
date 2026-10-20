CREATE TYPE "public"."loan_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "loan_repayments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"loan_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_on" date NOT NULL,
	"method" text NOT NULL,
	"note" text,
	"recorded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"reason" text NOT NULL,
	"status" "loan_request_status" DEFAULT 'pending' NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"borrower_user_id" text,
	"borrower_resource_id" text,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"issued_on" date NOT NULL,
	"reason" text,
	"paid_off_at" timestamp with time zone,
	"request_id" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_recorded_by_id_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_borrower_user_id_user_id_fk" FOREIGN KEY ("borrower_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_borrower_resource_id_resources_id_fk" FOREIGN KEY ("borrower_resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_request_id_loan_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."loan_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loan_repayments_loan_idx" ON "loan_repayments" USING btree ("loan_id","paid_on");--> statement-breakpoint
CREATE INDEX "loan_requests_workspace_idx" ON "loan_requests" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "loans_workspace_idx" ON "loans" USING btree ("workspace_id","issued_on");--> statement-breakpoint
CREATE INDEX "loans_borrower_user_idx" ON "loans" USING btree ("borrower_user_id");--> statement-breakpoint
CREATE INDEX "loans_borrower_resource_idx" ON "loans" USING btree ("borrower_resource_id");--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_one_borrower" CHECK (("borrower_user_id" IS NULL) <> ("borrower_resource_id" IS NULL));--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_amount_positive" CHECK ("amount" > 0);--> statement-breakpoint
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_amount_positive" CHECK ("amount" > 0);
