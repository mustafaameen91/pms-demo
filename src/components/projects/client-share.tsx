"use client";

import { useState, useTransition } from "react";
import { Copy, ExternalLink, Link2, Loader2, Link2Off } from "lucide-react";
import { toast } from "sonner";
import { createShareLink, revokeShareLink, setShareBudgetVisible } from "@/lib/actions/shares";
import { Button } from "@/components/ui/button";

export function ClientShare({
  projectId,
  share,
  appOrigin,
}: {
  projectId: string;
  share: { token: string; showBudget: boolean; lastViewedAt: Date | null } | null;
  appOrigin: string;
}) {
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
    <section aria-labelledby="client-heading" className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 id="client-heading" className="flex items-center gap-2 font-semibold">
        <Link2 className="size-4 text-muted-foreground" aria-hidden />
        Client access
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A private, read-only link for your client. They see progress, schedule and tasks — no login needed. Anyone with
        the link can view it, so share it only with the client.
      </p>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showBudget}
          disabled={pending}
          onChange={(e) => {
            setShowBudget(e.target.checked);
            if (share) run(() => setShareBudgetVisible(projectId, e.target.checked), e.target.checked ? "Budget is now visible to the client" : "Budget hidden from the client");
          }}
          className="size-4 accent-[var(--primary)]"
        />
        Also show budget and spending
      </label>

      {url ? (
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="share-url" className="sr-only">
              Client link
            </label>
            <input id="share-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-8 min-w-0 flex-1 rounded-lg border bg-muted px-2.5 font-mono text-xs" />
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success("Client link copied");
                } catch {
                  toast(url);
                }
              }}
            >
              <Copy className="size-4" />
              Copy
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Preview
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {share?.lastViewedAt ? `Last opened ${new Date(share.lastViewedAt).toLocaleString()}` : "Not opened yet."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => createShareLink(projectId, showBudget), "New link created — the old one no longer works")}>
              New link
            </Button>
            <Button
              size="sm"
              variant={confirmRevoke ? "destructive" : "ghost"}
              disabled={pending}
              aria-label={confirmRevoke ? "Confirm turning off client access" : "Turn off client access"}
              onClick={() => {
                if (!confirmRevoke) return setConfirmRevoke(true);
                setConfirmRevoke(false);
                run(() => revokeShareLink(projectId), "Client link turned off");
              }}
            >
              <Link2Off className="size-4" />
              {confirmRevoke ? "Click again to turn off" : "Turn off link"}
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-4" disabled={pending} onClick={() => run(() => createShareLink(projectId, showBudget), "Client link created")}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create client link
        </Button>
      )}
    </section>
  );
}
