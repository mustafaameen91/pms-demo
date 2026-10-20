CREATE TABLE "project_members" (
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
-- Existing projects: their manager and everyone already working in them join the team.
INSERT INTO "project_members" ("workspace_id", "project_id", "user_id")
SELECT DISTINCT p.workspace_id, p.id, x.user_id
FROM "projects" p
JOIN LATERAL (
  SELECT p.lead_id AS user_id
  UNION SELECT t.assignee_id FROM "tasks" t WHERE t.project_id = p.id
  UNION SELECT t.reporter_id FROM "tasks" t WHERE t.project_id = p.id
  UNION SELECT e.created_by_id FROM "expenses" e WHERE e.project_id = p.id
) x ON x.user_id IS NOT NULL
JOIN "member" m ON m.organization_id = p.workspace_id AND m.user_id = x.user_id
ON CONFLICT DO NOTHING;
