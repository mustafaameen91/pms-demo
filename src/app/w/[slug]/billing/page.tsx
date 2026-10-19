import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { CheckCircle2, Clock, CreditCard, Lock } from "lucide-react";
import { requireMembership } from "@/lib/auth/session";
import { PLAN_NAME, getPlatformSettings, getWorkspaceAccess } from "@/lib/billing";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Billing") };
}

export default async function BillingPage({ params }: PageProps<"/w/[slug]/billing">) {
  const { slug } = await params;
  const t = await getT();
  // Membership only: this page must work while the workspace is locked.
  const { workspace } = await requireMembership(slug);
  const canSeePayments = workspace.role === "owner" || workspace.role === "admin";
  const [access, settings, history] = await Promise.all([
    getWorkspaceAccess(workspace.id),
    getPlatformSettings(),
    canSeePayments
      ? db.select().from(payments).where(eq(payments.workspaceId, workspace.id)).orderBy(desc(payments.createdAt))
      : [],
  ]);

  const status = !access.allowed
    ? access.kind === "pending"
      ? { label: t("Awaiting payment"), icon: Clock, tone: "bad" }
      : access.kind === "expired"
        ? { label: t("Expired on {date}", { date: formatDate(access.paidUntil, t.intl) }), icon: Lock, tone: "bad" }
        : { label: t("Cancelled"), icon: Lock, tone: "bad" }
    : access.kind === "complimentary"
      ? { label: t("Active (complimentary)"), icon: CheckCircle2, tone: "good" }
      : {
          label: `${
            access.kind === "trial"
              ? t("Trial until {date}", { date: formatDate(access.paidUntil, t.intl) })
              : t("Active until {date}", { date: formatDate(access.paidUntil, t.intl) })
          } · ${t.plural(access.daysLeft, "{count} day left", "{count} days left")}`,
          icon: access.endingSoon ? Clock : CheckCircle2,
          tone: access.endingSoon ? "warn" : "good",
        };

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Billing")}</h1>
        <p className="text-sm text-muted-foreground">{t("Subscription for {workspace}.", { workspace: workspace.name })}</p>
      </div>

      <section aria-labelledby="plan-heading" className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="plan-heading" className="flex items-center gap-2 text-lg font-semibold">
              <CreditCard className="size-5 text-primary" aria-hidden />
              {t("{plan} plan", { plan: PLAN_NAME })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Unlimited projects, members, resources and storage. All features included.")}
            </p>
          </div>
          {settings.price && (
            <p className="text-end">
              <span className="text-2xl font-semibold">{formatMoney(settings.price, settings.currency, t.intl)}</span>
              <span className="text-sm text-muted-foreground"> / {t(settings.billingPeriod)}</span>
            </p>
          )}
        </div>
        <p
          className={cn(
            "mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
            status.tone === "good" && "bg-primary/10 text-primary",
            status.tone === "warn" && "bg-amber-500/10 text-amber-800 dark:text-amber-300",
            status.tone === "bad" && "bg-destructive/10 text-destructive",
          )}
        >
          <status.icon className="size-4 shrink-0" aria-hidden />
          {status.label}
        </p>
      </section>

      <section aria-labelledby="pay-heading" className="rounded-xl border bg-card p-5 sm:p-6">
        <h2 id="pay-heading" className="font-semibold">
          {t("How to pay")}
        </h2>
        {canSeePayments ? (
          <>
            <p className="mt-3 text-sm whitespace-pre-wrap">
              {settings.paymentInstructions ??
                t("Payment details haven't been published yet. Please contact us to arrange payment.")}
            </p>
            {settings.contact && (
              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">{t("Contact:")} </span>
                <span className="whitespace-pre-wrap">{settings.contact}</span>
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {t("After we receive your payment, your workspace is activated (or extended) manually — usually the same day.")}
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("Payments are handled by your workspace owner or admins. Ask them if the workspace is locked.")}
          </p>
        )}
      </section>

      {canSeePayments && (
        <section aria-labelledby="history-heading" className="overflow-hidden rounded-xl border bg-card">
          <h2 id="history-heading" className="border-b px-4 py-3 font-semibold">
            {t("Payment history")}
          </h2>
          {history.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("No payments recorded yet.")}</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-start text-xs text-muted-foreground">
                  <tr className="border-b bg-muted/40">
                    <th scope="col" className="py-2 pe-3 ps-4 font-medium">{t("Date")}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t("Method")}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t("Covers until")}</th>
                    <th scope="col" className="py-2 pe-4 ps-3 text-end font-medium">{t("Amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((p) => (
                    <tr key={p.id} className="border-b last:border-b-0">
                      <td className="py-2.5 pe-3 ps-4 tabular-nums">{formatDate(p.createdAt.toISOString().slice(0, 10), t.intl)}</td>
                      <td className="px-3 py-2.5">
                        {t(p.method)}
                        {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{formatDate(p.coversUntil, t.intl)}</td>
                      <td className="py-2.5 pe-4 ps-3 text-end font-medium tabular-nums">{formatMoney(p.amount, p.currency, t.intl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
