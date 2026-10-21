"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { setDocTypeEnabled } from "@/lib/actions/document-settings";
import type { DocTypeDef } from "@/lib/documents/types";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { DOC_ICONS } from "./documents-list";

type Item = DocTypeDef & { enabled: boolean; customized: boolean };

/** Every document type with an on/off switch and a link to customise it. */
export function DocFormsList({ slug, types }: { slug: string; types: Item[] }) {
  const t = useT();
  const lang = t.locale === "ar" ? "ar" : "en";
  return (
    <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {types.map((d) => (
        <FormCard key={d.key} slug={slug} item={d} lang={lang} />
      ))}
    </ul>
  );
}

function FormCard({ slug, item: d, lang }: { slug: string; item: Item; lang: "en" | "ar" }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  // Flip straight away; go back if saving fails.
  const [on, setOn] = useState(d.enabled);
  const Icon = DOC_ICONS[d.icon];
  const id = `form-on-${d.key}`;
  return (
    <li className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", !on && "bg-muted/40")}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {d.title[lang]}
            <bdi dir="ltr" className="font-mono text-xs text-muted-foreground">
              {d.prefix}-0001
            </bdi>
            {d.customized && <span className="rounded-full border px-1.5 text-[11px] text-muted-foreground">{t("Customised")}</span>}
          </p>
          <p className="text-xs text-muted-foreground">{d.description[lang]}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            id={id}
            type="checkbox"
            role="switch"
            checked={on}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              setOn(next);
              startTransition(async () => {
                const res = await setDocTypeEnabled(slug, d.key, next);
                if (!res.ok) {
                  setOn(!next);
                  return void toast.error(res.error);
                }
                toast.success(next ? t("{name} turned on", { name: d.title[lang] }) : t("{name} turned off", { name: d.title[lang] }));
              });
            }}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-5 w-9 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring after:absolute after:top-0.5 after:start-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 rtl:peer-checked:after:-translate-x-4"
          />
          {on ? t("On") : t("Off")}
        </label>
        <Button asChild variant="outline" size="sm">
          <Link href={`/w/${slug}/company/forms/${d.key}`} aria-label={t("Customise {name}", { name: d.title[lang] })}>
            <Pencil className="size-4" />
            {t("Customise")}
          </Link>
        </Button>
      </div>
    </li>
  );
}
