"use client";

import { useState, useTransition } from "react";
import { Copy, ExternalLink, Link2, Loader2, Link2Off } from "lucide-react";
import { toast } from "sonner";
import { createShareLink, revokeShareLink, setShareBudgetVisible } from "@/lib/actions/shares";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function ClientShare({
  projectId,
  share,
  appOrigin,
}: {
  projectId: string;
  share: { token: string; showBudget: boolean; lastViewedAt: Date | null } | null;
  appOrigin: string;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [showBudget, setShowBudget] = useState(share?.showBudget ?? false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const url = share ? `${appOrigin}/share/${share.token}` : null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(success);
      else toast.error(result.error);
    });

  return (
    <section aria-labelledby="client-heading" className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 id="client-heading" className="flex items-center gap-2.5 font-semibold">
        <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <Link2 className="size-4" />
        </span>
        {t("Client access")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "A private, read-only link for your client. They see progress, schedule and tasks — no login needed. Anyone with the link can view it, so share it only with the client.",
        )}
      </p>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showBudget}
          disabled={pending}
          onChange={(e) => {
            setShowBudget(e.target.checked);
            if (share) run(() => setShareBudgetVisible(projectId, e.target.checked), e.target.checked ? t("Budget is now visible to the client") : t("Budget hidden from the client"));
          }}
          className="size-4 accent-[var(--primary)]"
        />
        {t("Also show budget and spending")}
      </label>

      {url ? (
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="share-url" className="sr-only">
              {t("Client link")}
            </label>
            <input id="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-8 min-w-0 flex-1 rounded-lg border bg-muted px-2.5 font-mono text-xs" />
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success(t("Client link copied"));
                } catch {
                  toast(url);
                }
              }}
            >
              <Copy className="size-4" />
              {t("Copy")}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                {t("Preview")}
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {share?.lastViewedAt
              ? t("Last opened {date}", { date: new Date(share.lastViewedAt).toLocaleString(t.intl) })
              : t("Not opened yet.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => createShareLink(projectId, showBudget), t("New link created — the old one no longer works"))}>
              {t("New link")}
            </Button>
            <Button
              size="sm"
              variant={confirmRevoke ? "destructive" : "ghost"}
              disabled={pending}
              aria-label={confirmRevoke ? t("Confirm turning off client access") : t("Turn off client access")}
              onClick={() => {
                if (!confirmRevoke) return setConfirmRevoke(true);
                setConfirmRevoke(false);
                run(() => revokeShareLink(projectId), t("Client link turned off"));
              }}
            >
              <Link2Off className="size-4" />
              {confirmRevoke ? t("Click again to turn off") : t("Turn off link")}
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-4" disabled={pending} onClick={() => run(() => createShareLink(projectId, showBudget), t("Client link created"))}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("Create client link")}
        </Button>
      )}
    </section>
  );
}
