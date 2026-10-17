import type { Metadata } from "next";
import { getPlatformSettings } from "@/lib/billing";
import { listAllWorkspaces, recentPayments } from "@/lib/data/admin";
import { AdminPanel } from "@/components/admin/admin-panel";

export const metadata: Metadata = { title: "Platform admin" };

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
