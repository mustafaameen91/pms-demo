import { fail, json, mobileProject, readJson, requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { listRisks } from "@/lib/data/risks";
import { listMembers } from "@/lib/data/projects";
import { saveRisk } from "@/lib/actions/risks";
import { riskInput } from "@/lib/mobile/manage";
import { IMPACT_LABELS, LIKELIHOOD_LABELS, RISK_CATEGORIES, RISK_STATUSES, riskLevel, riskScore } from "@/lib/risks";

type Ctx = RouteContext<"/api/mobile/v1/w/[slug]/projects/[id]/risks">;

/** GET → the project's risks (highest first, closed last), the choices for the form, and who may edit what. */
export async function GET(request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const found = await mobileProject(authed, id);
  if (!found) return fail(404, "not_found", authed.t("Project not found"));
  const { t, user } = authed;
  const [risks, members] = await Promise.all([listRisks(id), found.manager ? listMembers(authed.workspace.id) : []]);
  return json({
    manager: found.manager,
    categories: RISK_CATEGORIES.map((c) => ({ value: c.value, label: t(c.label) })),
    statuses: RISK_STATUSES.map((s) => ({ value: s.value, label: t(s.label) })),
    likelihood: LIKELIHOOD_LABELS.map((l, i) => ({ value: i + 1, label: t(l) })),
    impact: IMPACT_LABELS.map((l, i) => ({ value: i + 1, label: t(l) })),
    // Only the manager chooses a risk's owner.
    people: members.map((m) => ({ id: m.id, name: m.name })),
    risks: risks.map((r) => {
      const score = riskScore(r.likelihood, r.impact);
      return {
        id: r.id,
        key: `R-${r.number}`,
        title: r.title,
        description: r.description,
        category: r.category,
        likelihood: r.likelihood,
        impact: r.impact,
        score,
        level: riskLevel(score),
        mitigation: r.mitigation,
        status: r.status,
        owner: r.ownerId ? { id: r.ownerId, name: r.ownerName } : null,
        task: r.taskNumber ? { id: r.taskId, key: `${found.project.key}-${r.taskNumber}`, title: r.taskTitle } : null,
        canEdit: found.manager || r.ownerId === user.id || r.createdById === user.id,
        updatedAt: r.updatedAt,
      };
    }),
  });
}

/** POST { title, category, likelihood, impact, status, description?, mitigation?, ownerId?, taskId? } → raise a risk. */
export async function POST(request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const input = riskInput(await readJson(request));
  return runAction(authed.t, () => saveRisk(id, null, input), 201);
}
