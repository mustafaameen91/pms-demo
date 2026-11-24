import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { CalendarClock, Check, CheckCircle2, Clock, CreditCard, Hourglass, Lock, Receipt, ShieldCheck, Wallet } from "lucide-react";
import { requireMembership } from "@/lib/auth/session";
import { PLAN_NAME, getPlatformSettings, getWorkspaceAccess } from "@/lib/billing";
import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { EmptyState, GradientIcon, PageHeader, PageShell, Panel, StatTile } from "@/components/page/kit";

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

  const features = [t("Unlimited projects"), t("Unlimited members"), t("Unlimited resources and storage"), t("All features included")];
  const lastPayment = history[0];

  return (
    <PageShell>
      <PageHeader icon={CreditCard} title={t("Billing")} description={t("Subscription for {workspace}.", { workspace: workspace.name })} />

      {access.allowed && access.kind !== "complimentary" && (
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile
            icon={access.endingSoon ? Clock : CheckCircle2}
            tone={access.endingSoon ? "bad" : "good"}
            label={access.kind === "trial" ? t("Trial") : t("Subscription")}
            value={t.plural(access.daysLeft, "{count} day left", "{count} days left")}
            hint={access.endingSoon ? t("Renew soon to keep access") : t("Everything is unlocked")}
          />
          <StatTile icon={CalendarClock} label={access.kind === "trial" ? t("Trial ends") : t("Paid until")} value={formatDate(access.paidUntil, t.intl)} />
          {canSeePayments && (
            <StatTile
              icon={Receipt}
              label={t("Payments")}
              value={history.length}
              hint={lastPayment ? t("Last on {date}", { date: formatDate(lastPayment.createdAt.toISOString().slice(0, 10), t.intl) }) : t("No payments recorded yet.")}
            />
          )}
        </dl>
      )}

      {/* The plan: one card, a coral edge marks it as the current one. */}
      <section aria-labelledby="plan-heading" className="relative overflow-hidden rounded-2xl border bg-card p-5 sm:p-6">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-brand-accent" />
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <GradientIcon icon={ShieldCheck} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="plan-heading" className="text-lg font-bold tracking-tight">
                  {t("{plan} plan", { plan: PLAN_NAME })}
                </h2>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{t("Your plan")}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t("Unlimited projects, members, resources and storage. All features included.")}</p>
            </div>
          </div>
          {settings.price && (
            <p className="text-end">
              <span className="text-3xl font-bold tracking-tight tabular-nums">{formatMoney(settings.price, settings.currency, t.intl)}</span>
              <span className="text-sm text-muted-foreground"> / {t(settings.billingPeriod)}</span>
            </p>
          )}
        </div>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm">
              <span aria-hidden className="grid size-5 place-items-center rounded-full bg-green-600/10 text-green-700 dark:text-green-400">
                <Check className="size-3.5" />
              </span>
              {f}
            </li>
          ))}
        </ul>
        <p
          className={cn(
            "mt-5 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium",
            status.tone === "good" && "bg-primary/10 text-primary",
            status.tone === "warn" && "bg-amber-500/10 text-amber-800 dark:text-amber-300",
            status.tone === "bad" && "bg-destructive/10 text-destructive",
          )}
        >
          <status.icon className="size-4 shrink-0" aria-hidden />
          {status.label}
        </p>
      </section>

      <Panel id="pay-heading" title={t("How to pay")} icon={Wallet}>
        <div className="border-t px-5 py-4">
          {canSeePayments ? (
            <>
              <p className="text-sm whitespace-pre-wrap">
                {settings.paymentInstructions ?? t("Payment details haven't been published yet. Please contact us to arrange payment.")}
              </p>
              {settings.contact && (
                <p className="mt-3 text-sm">
                  <span className="text-muted-foreground">{t("Contact:")} </span>
                  <span className="whitespace-pre-wrap">{settings.contact}</span>
                </p>
              )}
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                <Hourglass className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t("After we receive your payment, your workspace is activated (or extended) manually — usually the same day.")}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Payments are handled by your workspace owner or admins. Ask them if the workspace is locked.")}</p>
          )}
        </div>
      </Panel>

      {canSeePayments &&
        (history.length === 0 ? (
          <EmptyState icon={Receipt} title={t("Payment history")}>
            {t("No payments recorded yet.")}
          </EmptyState>
        ) : (
          <Panel id="history-heading" title={t("Payment history")} icon={Receipt} count={history.length}>
            <div className="relative overflow-x-auto border-t">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-start text-xs text-muted-foreground">
                  <tr className="border-b bg-muted/40">
                    <th scope="col" className="py-2.5 pe-3 ps-5 font-medium">{t("Date")}</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">{t("Method")}</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">{t("Covers until")}</th>
                    <th scope="col" className="py-2.5 pe-5 ps-3 text-end font-medium">{t("Amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((p) => (
                    <tr key={p.id} className="border-b transition-colors last:border-b-0 hover:bg-accent">
                      <td className="py-3 pe-3 ps-5 tabular-nums">{formatDate(p.createdAt.toISOString().slice(0, 10), t.intl)}</td>
                      <td className="px-3 py-3">
                        {t(p.method)}
                        {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                      </td>
                      <td className="px-3 py-3 tabular-nums">{formatDate(p.coversUntil, t.intl)}</td>
                      <td className="py-3 pe-5 ps-3 text-end font-semibold tabular-nums">{formatMoney(p.amount, p.currency, t.intl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}
    </PageShell>
  );
}
