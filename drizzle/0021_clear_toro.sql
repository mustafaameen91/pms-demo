CREATE TABLE "document_type_settings" (
	"workspace_id" text NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_type_settings_workspace_id_type_pk" PRIMARY KEY("workspace_id","type")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "layout" jsonb;--> statement-breakpoint
ALTER TABLE "document_type_settings" ADD CONSTRAINT "document_type_settings_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_type_settings" ADD CONSTRAINT "document_type_settings_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;