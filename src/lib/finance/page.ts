import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { ensureLedger, getFinanceSettings } from "@/lib/finance/ledger";
import { todayISO } from "@/lib/accomplishment";

/** Every Finance page: owners/admins only, set up (else the setup screen), books in sync. */
export async function financePage(slug: string) {
  const auth = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(auth.workspace.role)) notFound();
  const settings = await getFinanceSettings(auth.workspace.id);
  if (!settings) redirect(`/w/${auth.workspace.slug}/finance`);
  await ensureLedger(auth.workspace.id);
  return { ...auth, settings, today: todayISO(), base: `/w/${auth.workspace.slug}/finance` };
}
