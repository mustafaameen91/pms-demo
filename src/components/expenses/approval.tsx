"use client";

import { useState, useTransition } from "react";
import { Check, CircleCheck, Clock, Loader2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { decideExpense } from "@/lib/actions/expenses";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";

export type ApprovalState = "approved" | "pending" | "rejected";

/** Status chip for an expense (icon + text). Approved shows nothing unless `showApproved`. */
export function ApprovalBadge({
  status,
  decidedBy,
  note,
  showApproved,
}: {
  status: ApprovalState;
  decidedBy?: string | null;
  note?: string | null;
  showApproved?: boolean;
}) {
  const t = useT();
  if (status === "approved" && !(showApproved && decidedBy)) return null;
  const s = {
    pending: { icon: Clock, text: t("Waiting for approval"), cls: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
    rejected: { icon: XCircle, text: decidedBy ? t("Rejected by {name}", { name: decidedBy }) : t("Rejected"), cls: "border-destructive/30 bg-destructive/10 text-destructive" },
    approved: { icon: CircleCheck, text: decidedBy ? t("Approved by {name}", { name: decidedBy }) : t("Approved"), cls: "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400" },
  }[status];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium", s.cls)}>
        <s.icon className="size-3" aria-hidden />
        {s.text}
      </span>
      {note && status !== "pending" && <span className="text-xs text-muted-foreground">“{note}”</span>}
    </span>
  );
}

/** Approve / reject controls. Rejecting asks for a reason. */
export function DecisionButtons({ expenseId, label }: { expenseId: string; label: string }) {
  const t = useT();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const decide = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const result = await decideExpense(expenseId, { decision, note });
      if (result.ok) toast.success(decision === "approved" ? t("Approved: {label}", { label }) : t("Rejected: {label}", { label }));
      else toast.error(result.error);
    });

  if (rejecting) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          decide("rejected");
        }}
      >
        <label htmlFor={`reject-${expenseId}`} className="sr-only">
          {t("Reason for rejecting {label}", { label })}
        </label>
        <Input
          id={`reject-${expenseId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("Reason (required)")}
          maxLength={500}
          autoFocus
          className="h-8 w-56"
        />
        <Button type="submit" size="sm" variant="destructive" disabled={pending || !note.trim()}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("Reject")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>
          {t("Cancel")}
        </Button>
      </form>
    );
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => decide("approved")} aria-label={t("Approve {label}", { label })}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {t("Approve")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={pending}
        onClick={() => setRejecting(true)}
        aria-label={t("Reject {label}", { label })}
      >
        <X className="size-4" />
        {t("Reject")}
      </Button>
    </div>
  );
}
