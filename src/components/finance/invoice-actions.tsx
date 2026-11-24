"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Pencil, Printer, Send, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { deleteInvoice, setInvoiceStatus } from "@/lib/actions/finance";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";

/** Issue, edit, print, cancel or delete an invoice, depending on where it stands. */
export function InvoiceActions({ slug, id, status, paid, locked }: { slug: string; id: string; status: string; paid: number; locked: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, then?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      toast.success(done);
      then?.();
    });
  const base = `/w/${slug}/finance/invoices`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <a href={`/print/${slug}/finance/invoices/${id}`} target="_blank" rel="noopener">
          <Printer className="size-4" />
          {t("Print / PDF")}
        </a>
      </Button>
      {status !== "cancelled" && !locked && (
        <Button variant="outline" asChild>
          <Link href={`${base}/${id}/edit`}>
            <Pencil className="size-4" />
            {t("Edit")}
          </Link>
        </Button>
      )}
      {status === "draft" && (
        <>
          <Button variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => confirm(t("Delete this draft?")) && run(() => deleteInvoice(id, slug), t("Draft deleted"), () => router.push(base))}>
            <Trash2 className="size-4" />
            {t("Delete")}
          </Button>
          <Button disabled={pending} onClick={() => run(() => setInvoiceStatus(id, slug, "issued"), t("Invoice issued"))}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t("Issue")}
          </Button>
        </>
      )}
      {status === "issued" && paid === 0 && !locked && (
        <>
          <Button variant="ghost" disabled={pending} onClick={() => run(() => setInvoiceStatus(id, slug, "draft"), t("Back to draft"))}>
            <Undo2 className="size-4" />
            {t("Back to draft")}
          </Button>
          <Button variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => confirm(t("Cancel this invoice? It's kept, marked cancelled, and leaves the books.")) && run(() => setInvoiceStatus(id, slug, "cancelled"), t("Invoice cancelled"))}>
            <Ban className="size-4" />
            {t("Cancel invoice")}
          </Button>
        </>
      )}
    </div>
  );
}
