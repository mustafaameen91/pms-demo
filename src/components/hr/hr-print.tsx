import Link from "next/link";
import type { ReactNode } from "react";
import { isPaperStyle, type CompanyProfile } from "@/lib/branding";
import type { T } from "@/i18n/translate";
import { LightTheme } from "@/components/light-theme";
import { Paper, Stamp } from "@/components/documents/paper";
import { PrintButton } from "@/app/print/[slug]/[key]/print-button";

/** A4 sheets on the letterhead with a back link, language switch and print button (hidden on paper). */
export function HrPrintShell({
  back,
  backLabel,
  switchHref,
  switchLabel,
  children,
}: {
  back: string;
  backLabel: string;
  switchHref: string;
  switchLabel: string;
  children: ReactNode;
}) {
  return (
    <LightTheme>
      <style>{`@page { size: A4; margin: 0; } @media print { body { background: white; } .sheet + .sheet { break-before: page; } }`}</style>
      <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
        <div className="mx-auto mb-4 flex w-[210mm] max-w-full flex-wrap items-center justify-between gap-4 px-2 print:hidden">
          <Link href={back} className="text-sm text-primary underline-offset-4 hover:underline">
            {backLabel}
          </Link>
          <div className="flex items-center gap-3">
            <Link href={switchHref} className="text-sm text-primary underline-offset-4 hover:underline">
              {switchLabel}
            </Link>
            <PrintButton />
          </div>
        </div>
        <div className="mx-auto grid w-fit gap-6 print:gap-0">{children}</div>
      </div>
    </LightTheme>
  );
}

export function Sheet({ profile, lang, children }: { profile: CompanyProfile; lang: "ar" | "en"; children: ReactNode }) {
  return (
    <div className="sheet overflow-x-auto shadow-lg print:shadow-none">
      <Paper profile={profile} style={isPaperStyle(profile.defaultStyle) ? profile.defaultStyle : "classic"} lang={lang}>
        {children}
      </Paper>
    </div>
  );
}

/** Title block of an HR document. */
export function DocTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6 text-center">
      <h1 className="text-[16pt] font-bold" style={{ color: "var(--brand-ink)" }}>
        {title}
      </h1>
      {subtitle && <p className="mt-1 text-[10pt] text-gray-600">{subtitle}</p>}
    </div>
  );
}

/** Two-column facts, bordered. */
export function FactGrid({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="mb-6 grid grid-cols-2 border border-gray-300 text-[10pt]">
      {items.map(([k, v], i) => (
        <div key={i} className="flex gap-2 border-b border-gray-200 px-3 py-1.5 odd:border-e">
          <dt className="w-32 shrink-0 text-gray-600">{k}</dt>
          <dd className="font-medium">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Amount rows with a total line. */
export function MoneyTable({ head, rows, total }: { head: [string, string]; rows: [string, string, "plus" | "minus" | null][]; total?: [string, string] }) {
  return (
    <table className="mb-6 w-full border-collapse text-[10pt]">
      <thead>
        <tr style={{ backgroundColor: "color-mix(in srgb, var(--brand) 12%, white)" }}>
          <th className="border border-gray-300 px-3 py-1.5 text-start">{head[0]}</th>
          <th className="w-40 border border-gray-300 px-3 py-1.5 text-end">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, v, sign], i) => (
          <tr key={i}>
            <td className="border border-gray-300 px-3 py-1.5">{k}</td>
            <td className={`border border-gray-300 px-3 py-1.5 text-end tabular-nums ${sign === "minus" ? "text-red-700" : ""}`}>
              <bdi dir="ltr">
                {sign === "minus" ? "−" : ""}
                {v}
              </bdi>
            </td>
          </tr>
        ))}
      </tbody>
      {total && (
        <tfoot>
          <tr className="font-bold">
            <td className="border border-gray-400 px-3 py-2">{total[0]}</td>
            <td className="border border-gray-400 px-3 py-2 text-end tabular-nums">
              <bdi dir="ltr">{total[1]}</bdi>
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** Signature boxes, with the company stamp in the last one. */
export function Signatures({ names, profile }: { names: string[]; profile: CompanyProfile }) {
  return (
    <div className="mt-10 grid gap-8 text-[10pt]" style={{ gridTemplateColumns: `repeat(${names.length}, 1fr)` }}>
      {names.map((n, i) => (
        <div key={i} className="relative">
          <div className="h-16" />
          {i === names.length - 1 && <Stamp profile={profile} className="absolute -top-2 inset-e-0" />}
          <div className="border-t border-gray-400 pt-1 text-center text-gray-700">{n}</div>
        </div>
      ))}
    </div>
  );
}

/** Formats money in the document's language. */
export const docMoney = (t: T) => (v: string | number, currency: string) => {
  try {
    return new Intl.NumberFormat(t.intl, { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(v));
  } catch {
    return `${Number(v).toFixed(2)} ${currency}`;
  }
};
