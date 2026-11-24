import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getAssignment } from "@/lib/data/hr-ops";
import { getCompanyProfile } from "@/lib/data/company";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { employeeCode } from "@/lib/hr";
import { ASSET_CATEGORIES, ASSET_CONDITIONS, assetCode } from "@/lib/hr-rules";
import { labelOf } from "@/lib/hr";
import { formatDate } from "@/lib/utils";
import { getT, tFor } from "@/i18n/server";
import { DocTitle, FactGrid, HrPrintShell, Sheet, Signatures, docMoney } from "@/components/hr/hr-print";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Asset handover receipt") };
}

/** Receipt for an asset handed to someone (and, once back, the return). */
export default async function PrintHandover({ params, searchParams }: PageProps<"/print/[slug]/hr/handover/[id]">) {
  const [{ slug, id }, q, t] = await Promise.all([params, searchParams, getT()]);
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const row = await getAssignment(workspace.id, id);
  if (!row) notFound();
  const profile = await getCompanyProfile(workspace.id);
  const lang = q.lang === "en" || q.lang === "ar" ? q.lang : profile.defaultLanguage === "en" ? "en" : "ar";
  const tr = tFor(lang);
  const { a, asset, employee: e } = row;
  return (
    <HrPrintShell back={`/w/${workspace.slug}/hr/assets`} backLabel={t("← Back to assets")} switchHref={`?lang=${lang === "ar" ? "en" : "ar"}`} switchLabel={lang === "ar" ? "English" : "العربية"}>
      <Sheet profile={profile} lang={lang}>
        <DocTitle title={a.returnedOn ? tr("Asset return receipt") : tr("Asset handover receipt")} subtitle={formatDate(a.returnedOn ?? a.assignedOn, tr.intl)} />
        <FactGrid
          items={[
            [tr("Received by"), e.name],
            [tr("Number"), <bdi key="e" dir="ltr">{employeeCode(e.number)}</bdi>],
            [tr("Job title"), e.jobTitle],
            [tr("Handed over on"), formatDate(a.assignedOn, tr.intl)],
          ]}
        />
        <table className="mb-6 w-full border-collapse text-[10pt]">
          <thead>
            <tr style={{ backgroundColor: "color-mix(in srgb, var(--brand) 12%, white)" }}>
              <th className="border border-gray-300 px-3 py-1.5 text-start">{tr("Asset")}</th>
              <th className="border border-gray-300 px-3 py-1.5 text-start">{tr("Tag / serial number")}</th>
              <th className="border border-gray-300 px-3 py-1.5 text-start">{tr("Condition")}</th>
              <th className="border border-gray-300 px-3 py-1.5 text-end">{tr("Value")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-3 py-1.5">
                {asset.name}
                <span className="block text-[9pt] text-gray-600">
                  {tr(labelOf(ASSET_CATEGORIES, asset.category))} · <bdi dir="ltr">{assetCode(asset.number)}</bdi>
                </span>
              </td>
              <td className="border border-gray-300 px-3 py-1.5">
                <bdi dir="ltr">{asset.serial ?? "—"}</bdi>
              </td>
              <td className="border border-gray-300 px-3 py-1.5">{tr(labelOf(ASSET_CONDITIONS, a.conditionOut))}</td>
              <td className="border border-gray-300 px-3 py-1.5 text-end">{asset.value ? <bdi dir="ltr">{docMoney(tr)(asset.value, asset.currency)}</bdi> : "—"}</td>
            </tr>
          </tbody>
        </table>
        {a.noteOut && <p className="mb-4 text-[10pt]">{tr("Note: {note}", { note: a.noteOut })}</p>}
        <p className="mb-4 text-[10pt] leading-relaxed">
          {tr("I received the asset above in the condition stated. I will look after it, use it for work only, and return it when asked or when I leave the company. Loss or damage through misuse may be deducted from my dues.")}
        </p>
        {a.returnedOn && (
          <div className="mb-4 rounded border border-gray-300 p-3 text-[10pt]">
            <p className="font-semibold">{tr("Returned")}</p>
            <p>
              {tr("Returned on {date} in {condition} condition.", { date: formatDate(a.returnedOn, tr.intl), condition: tr(labelOf(ASSET_CONDITIONS, a.conditionIn ?? "good")).toLowerCase() })}
              {a.noteIn ? ` ${a.noteIn}` : ""}
            </p>
          </div>
        )}
        <Signatures names={[tr("Employee"), tr("Handed over by")]} profile={profile} />
      </Sheet>
    </HrPrintShell>
  );
}
