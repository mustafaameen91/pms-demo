"use server";

import { refresh } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, automationRules, projects } from "@/lib/db/schema";
import { brokenReason, describeRule, ruleSchema, type Action, type RuleInput, type Trigger } from "@/lib/automations";
import { resetLateSweep, ruleNames } from "@/lib/automation-runner";
import { canManageProject } from "@/lib/permissions";
import { getT, tFor } from "@/i18n/server";
import type { T } from "@/i18n/translate";

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

const NOT_ALLOWED = "Only admins or the project manager can change automations."; // t(NOT_ALLOWED) where returned

/** Validates the rule and checks that its columns and people belong to this project / workspace. */
async function check(project: typeof projects.$inferSelect, input: RuleInput, t: T) {
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) } as const;
  const names = await ruleNames(project.id, project.workspaceId, project.currency);
  const broken = brokenReason(parsed.data, names);
  if (broken) return { ok: false, error: t("That column or person isn't in this project any more. Pick again.") } as const;
  return { ok: true, rule: parsed.data } as const;
}

/** The history shows the rule in each viewer's language, so it's stored in both (`rule`, `rule_ar`). */
async function log(project: typeof projects.$inferSelect, actorId: string, type: string, rule: { trigger: Trigger; action: Action }) {
  const describe = async (t: T) =>
    describeRule(rule, await ruleNames(project.id, project.workspaceId, project.currency, t), t);
  const [en, ar] = await Promise.all([describe(tFor("en")), describe(tFor("ar"))]);
  await db.insert(activities).values({
    workspaceId: project.workspaceId,
    projectId: project.id,
    actorId,
    type,
    data: { rule: en, rule_ar: ar },
  });
}

export async function createAutomation(projectId: string, input: RuleInput): Promise<Result> {
  const t = await getT();
  const auth = await manage(projectId);
  if (!auth) return { ok: false, error: t(NOT_ALLOWED) };
  const checked = await check(auth.project, input, t);
  if (!checked.ok) return checked;
  const [{ n }] = await db.select({ n: count() }).from(automationRules).where(eq(automationRules.projectId, projectId));
  if (n >= MAX_RULES) return { ok: false, error: t("At most {max} automations per project.", { max: MAX_RULES }) };
  await db.insert(automationRules).values({
    workspaceId: auth.project.workspaceId,
    projectId,
    trigger: checked.rule.trigger,
    action: checked.rule.action,
    createdById: auth.user.id,
  });
  await log(auth.project, auth.user.id, "automation.created", checked.rule);
  resetLateSweep(auth.project.workspaceId);
  refresh();
  return { ok: true };
}

export async function updateAutomation(ruleId: string, input: RuleInput): Promise<Result> {
  const t = await getT();
  const auth = await manageRule(ruleId);
  if (!auth) return { ok: false, error: t(NOT_ALLOWED) };
  const checked = await check(auth.project, input, t);
  if (!checked.ok) return checked;
  await db
    .update(automationRules)
    .set({ trigger: checked.rule.trigger, action: checked.rule.action })
    .where(eq(automationRules.id, ruleId));
  await log(auth.project, auth.user.id, "automation.updated", checked.rule);
  resetLateSweep(auth.project.workspaceId);
  refresh();
  return { ok: true };
}

export async function setAutomationEnabled(ruleId: string, enabled: boolean): Promise<Result> {
  const t = await getT();
  const auth = await manageRule(ruleId);
  if (!auth) return { ok: false, error: t(NOT_ALLOWED) };
  if (auth.rule.enabled === enabled) return { ok: true };
  await db
    .update(automationRules)
    .set({ enabled })
    .where(and(eq(automationRules.id, ruleId), eq(automationRules.projectId, auth.project.id)));
  await log(auth.project, auth.user.id, enabled ? "automation.enabled" : "automation.disabled", auth.rule);
  if (enabled) resetLateSweep(auth.project.workspaceId);
  refresh();
  return { ok: true };
}

export async function deleteAutomation(ruleId: string): Promise<Result> {
  const t = await getT();
  const auth = await manageRule(ruleId);
  if (!auth) return { ok: false, error: t(NOT_ALLOWED) };
  // Described before deleting (the names are looked up from the project, not the rule).
  const rule = { trigger: auth.rule.trigger, action: auth.rule.action };
  // Its run history goes with it.
  await db.delete(automationRules).where(eq(automationRules.id, ruleId));
  await log(auth.project, auth.user.id, "automation.deleted", rule);
  refresh();
  return { ok: true };
}
