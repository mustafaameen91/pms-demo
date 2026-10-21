CREATE TABLE "company_profiles" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"name_en" text,
	"name_ar" text,
	"address_en" text,
	"address_ar" text,
	"phone" text,
	"email" text,
	"website" text,
	"registration_no" text,
	"tax_no" text,
	"footer_en" text,
	"footer_ar" text,
	"brand_color" text DEFAULT '#0D9488' NOT NULL,
	"logo_path" text,
	"logo_type" text,
	"stamp_path" text,
	"stamp_type" text,
	"default_style" text DEFAULT 'classic' NOT NULL,
	"default_language" text DEFAULT 'ar' NOT NULL,
	"updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;