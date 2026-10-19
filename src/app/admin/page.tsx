import type { Metadata } from "next";
import { getPlatformSettings } from "@/lib/billing";
import { listAllWorkspaces, recentPayments } from "@/lib/data/admin";
import { AdminPanel } from "@/components/admin/admin-panel";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Platform admin") };
}

export default async function AdminPage() {
  const [workspaces, payments, settings] = await Promise.all([
    listAllWorkspaces(),
    recentPayments(),
    getPlatformSettings(),
  ]);
  return (
    <AdminPanel
      workspaces={workspaces}
      payments={payments}
      settings={{
        price: settings.price,
        currency: settings.currency,
        billingPeriod: settings.billingPeriod,
        paymentInstructions: settings.paymentInstructions,
        contact: settings.contact,
      }}
    />
  );
}
