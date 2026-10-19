"use server";

import { refresh } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, automationRules, projects } from "@/lib/db/schema";
import { brokenReason, describeRule, ruleSchema, type RuleInput } from "@/lib/automations";
import { resetLateSweep, ruleNames } from "@/lib/automation-runner";
import { canManageProject } from "@/lib/permissions";

type Result = { ok: true } | { ok: false; error: string };

const MAX_RULES = 30;

async function manage(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const { user, role } = await requireWorkspaceById(project.workspaceId);
  return canManageProject(role, user.id, project) ? { project, user } : null;
}

async function manageRule(ruleId: string) {
  const [rule] = await db.select().from(automationRules).where(eq(automationRules.id, ruleId)).limit(1);
  if (!rule) return null;
  const auth = await manage(rule.projectId);
  return auth ? { rule, ...auth } : null;
}

const NOT_ALLOWED = "Only admins or the project manager can change automations.";

/** Validates the rule and checks that its columns and people belong to this project / workspace. */
async function check(project: typeof projects.$inferSelect, input: RuleInput) {
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message } as const;
  const names = await ruleNames(project.id, project.workspaceId, project.currency);
  const broken = brokenReason(parsed.data, names);
  if (broken) return { ok: false, error: "That column or person isn't in this project any more. Pick again." } as const;
  return { ok: true, rule: parsed.data, text: describeRule(parsed.data, names) } as const;
}

async function log(project: typeof projects.$inferSelect, actorId: string, type: string, rule: string) {
  await db.insert(activities).values({
    workspaceId: project.workspaceId,
    projectId: project.id,
    actorId,
    type,
    data: { rule },
  });
}

export async function createAutomation(projectId: string, input: RuleInput): Promise<Result> {
  const auth = await manage(projectId);
  if (!auth) return { ok: false, error: NOT_ALLOWED };
  const checked = await check(auth.project, input);
  if (!checked.ok) return checked;
  const [{ n }] = await db.select({ n: count() }).from(automationRules).where(eq(automationRules.projectId, projectId));
  if (n >= MAX_RULES) return { ok: false, error: `At most ${MAX_RULES} automations per project.` };
  await db.insert(automationRules).values({
    workspaceId: auth.project.workspaceId,
    projectId,
    trigger: checked.rule.trigger,
    action: checked.rule.action,
    createdById: auth.user.id,
  });
  await log(auth.project, auth.user.id, "automation.created", checked.text);
  resetLateSweep(auth.project.workspaceId);
  refresh();
  return { ok: true };
}

export async function updateAutomation(ruleId: string, input: RuleInput): Promise<Result> {
  const auth = await manageRule(ruleId);
  if (!auth) return { ok: false, error: NOT_ALLOWED };
  const checked = await check(auth.project, input);
  if (!checked.ok) return checked;
  await db
    .update(automationRules)
    .set({ trigger: checked.rule.trigger, action: checked.rule.action })
    .where(eq(automationRules.id, ruleId));
  await log(auth.project, auth.user.id, "automation.updated", checked.text);
  resetLateSweep(auth.project.workspaceId);
  refresh();
  return { ok: true };
}

export async function setAutomationEnabled(ruleId: string, enabled: boolean): Promise<Result> {
  const auth = await manageRule(ruleId);
  if (!auth) return { ok: false, error: NOT_ALLOWED };
  if (auth.rule.enabled === enabled) return { ok: true };
  await db
    .update(automationRules)
    .set({ enabled })
    .where(and(eq(automationRules.id, ruleId), eq(automationRules.projectId, auth.project.id)));
  const names = await ruleNames(auth.project.id, auth.project.workspaceId, auth.project.currency);
  await log(auth.project, auth.user.id, enabled ? "automation.enabled" : "automation.disabled", describeRule(auth.rule, names));
  if (enabled) resetLateSweep(auth.project.workspaceId);
  refresh();
  return { ok: true };
}

export async function deleteAutomation(ruleId: string): Promise<Result> {
  const auth = await manageRule(ruleId);
  if (!auth) return { ok: false, error: NOT_ALLOWED };
  const names = await ruleNames(auth.project.id, auth.project.workspaceId, auth.project.currency);
  // Its run history goes with it.
  await db.delete(automationRules).where(eq(automationRules.id, ruleId));
  await log(auth.project, auth.user.id, "automation.deleted", describeRule(auth.rule, names));
  refresh();
  return { ok: true };
}
