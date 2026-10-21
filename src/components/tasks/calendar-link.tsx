"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Check, Copy, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getCalendarLink, resetCalendarLink } from "@/lib/actions/calendar";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** "Calendar link": your tasks and milestones in Google / Outlook / phone calendar. */
export function CalendarLinkButton({ slug }: { slug: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, startTransition] = useTransition();
  const webcal = url?.replace(/^https?:/, "webcal:");

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          if (!url) startTransition(async () => setUrl((await getCalendarLink(slug)).url));
        }}
      >
        <CalendarPlus className="size-4" />
        {t("Calendar link")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Your calendar link")}</DialogTitle>
            <DialogDescription>
              {t("Add it once to Google Calendar, Outlook or your phone: your open tasks and the milestones of your projects appear there and stay up to date.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="calendar-url" className="text-sm font-medium">
              {t("Private link")}
            </label>
            <div className="flex gap-2">
              <Input id="calendar-url" readOnly dir="ltr" value={url ?? ""} placeholder={pending ? t("Loading…") : ""} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                disabled={!url}
                onClick={async () => {
                  await navigator.clipboard.writeText(url!).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                aria-label={t("Copy the link")}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? t("Copied") : t("Copy")}
              </Button>
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300">{t("Anyone with this link can see your tasks. Don't share it; reset it if you did.")}</p>
          </div>
          {webcal && (
            <Button asChild variant="secondary" className="w-fit">
              <a href={webcal}>
                <CalendarPlus className="size-4" />
                {t("Open in my calendar app")}
              </a>
            </Button>
          )}
          <details className="rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">{t("How to add it")}</summary>
            <ul className="mt-2 grid gap-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Google Calendar:</strong> {t("Other calendars → + → From URL → paste the link.")}
              </li>
              <li>
                <strong className="text-foreground">Outlook:</strong> {t("Add calendar → Subscribe from web → paste the link.")}
              </li>
              <li>
                <strong className="text-foreground">iPhone:</strong> {t("Settings → Calendar → Accounts → Add account → Other → Add subscribed calendar.")}
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{t("Calendar apps check for changes every few hours, so a change can take a while to appear.")}</p>
          </details>
          <div>
            <Button
              type="button"
              variant={confirmReset ? "destructive" : "ghost"}
              size="sm"
              disabled={pending}
              onBlur={() => setConfirmReset(false)}
              onClick={() => {
                if (!confirmReset) return setConfirmReset(true);
                startTransition(async () => {
                  setUrl((await resetCalendarLink(slug)).url);
                  setConfirmReset(false);
                  toast.success(t("New link made. The old one no longer works; add the new one to your calendar."));
                });
              }}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {confirmReset ? t("Click again: the old link stops working") : t("Reset link")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
