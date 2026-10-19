"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setApprovalThreshold } from "@/lib/actions/expenses";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";
import { FieldError } from "./project-fields";

export function ApprovalThreshold({
  projectId,
  currency,
  current,
}: {
  projectId: string;
  currency: string;
  current: string | null;
}) {
  const t = useT();
  const [value, setValue] = useState(current ? String(Number(current)) : "");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="approval-heading" className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 id="approval-heading" className="flex items-center gap-2 font-semibold">
        <BadgeCheck className="size-4 text-muted-foreground" aria-hidden />
        {t("Expense approvals")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "Expenses above this amount, added by team members, wait for approval from the project manager or a workspace admin. Only approved expenses count as spent. Leave empty to turn approvals off.",
        )}
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          startTransition(async () => {
            const result = await setApprovalThreshold(projectId, value);
            if (!result.ok) return setError(result.error);
            toast.success(
              value.trim()
                ? t("Expenses above {amount} now need approval", { amount: formatMoney(value.replace(/,/g, ""), currency, t.intl) })
                : t("Approvals turned off"),
            );
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="approval-threshold">{t("Needs approval above ({currency})", { currency })}</Label>
          <Input
            id="approval-threshold"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("No approval needed")}
            className="w-56 tabular-nums"
            aria-invalid={Boolean(error)}
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("Save")}
        </Button>
        <FieldError message={error} />
      </form>
    </section>
  );
}
