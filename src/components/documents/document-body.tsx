import type { CompanyProfile, DocumentLanguage } from "@/lib/branding";
import { DOC_LABELS, DOC_STATUSES, docNumber, docTotals, type DocItem, type DocTypeDef } from "@/lib/documents/types";
import { amountInWords } from "@/lib/documents/words";
import { intlLocale } from "@/i18n/config";
import { cn, formatDate, formatMoney, formatNumber } from "@/lib/utils";
import { Stamp } from "./paper";

export type DocContent = {
  number: number;
  status: string;
  date: string;
  currency: string;
  data: Record<string, string>;
  items: DocItem[];
  taxRate: string | null;
};

/**
 * What goes inside the letterhead: title, details, items, totals, amount in
 * words and signature boxes — all in the document's own language.
 * Pure markup (no hooks): used by the live editor preview and the print page.
 */
export function DocumentBody({
  def,
  doc,
  lang,
  profile,
  projectName,
}: {
  def: DocTypeDef;
  doc: DocContent;
  lang: DocumentLanguage;
  profile: CompanyProfile;
  projectName: string;
}) {
  const L = DOC_LABELS[lang];
  const intl = intlLocale(lang);
  const money = (v: number | string) => formatMoney(v, doc.currency, intl);
  const date = (v: string) => (v ? formatDate(v, intl) : "—");
  const value = (key: string) => doc.data[key] ?? "";
  const totals = def.items?.prices ? docTotals(doc.items, doc.taxRate) : null;
  const wordsAmount = def.words === "total" ? (totals?.total ?? null) : def.words ? Number(value(def.words) || 0) : null;
  const shortFields = def.fields.filter((f) => f.kind !== "textarea");
  const longFields = def.fields.filter((f) => f.kind === "textarea" && value(f.key).trim());
  const watermark = doc.status === "draft" || doc.status === "cancelled" ? DOC_STATUSES.find((s) => s.value === doc.status)!.label[lang] : null;

  const show = (key: string, kind: string, options?: { value: string; label: { en: string; ar: string } }[]) => {
    const v = value(key);
    if (!v) return "—";
    if (kind === "date") return date(v);
    if (kind === "money") return money(v);
    if (options) return options.find((o) => o.value === v)?.label[lang] ?? v;
    return v;
  };

  return (
    <div className="relative">
      {watermark && (
        <p
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[40mm] -rotate-[24deg] text-center text-[72pt] font-bold tracking-widest text-gray-900/[0.06] select-none"
        >
          {watermark}
        </p>
      )}

      <div className="flex items-start justify-between gap-[6mm]">
        <h1 className="text-[20pt] leading-tight font-semibold" style={{ color: "var(--brand-ink)" }}>
          {def.title[lang]}
        </h1>
        <dl className="shrink-0 text-end text-[10pt]">
          <div className="flex justify-end gap-2">
            <dt className="text-gray-500">{L.number}</dt>
            <dd className="font-semibold">
              <bdi dir="ltr">{docNumber(def.prefix, doc.number)}</bdi>
            </dd>
          </div>
          <div className="flex justify-end gap-2">
            <dt className="text-gray-500">{L.date}</dt>
            <dd>{date(doc.date)}</dd>
          </div>
          <div className="flex justify-end gap-2">
            <dt className="text-gray-500">{L.project}</dt>
            <dd>{projectName}</dd>
          </div>
        </dl>
      </div>

      {shortFields.length > 0 && (
        <dl className="mt-[6mm] grid grid-cols-2 gap-x-[8mm] gap-y-[2.5mm] text-[10.5pt]">
          {shortFields.map((f) => (
            <div key={f.key} className={cn("border-b border-gray-200 pb-[1.5mm]", !f.half && "col-span-2")}>
              <dt className="text-[8.5pt] text-gray-500">{f.label[lang]}</dt>
              <dd className="font-medium">{show(f.key, f.kind, f.options)}</dd>
            </div>
          ))}
        </dl>
      )}

      {def.items && (
        <table className="mt-[6mm] w-full border-collapse text-[10pt]">
          <thead>
            <tr className="border-b-2 text-start" style={{ borderColor: "var(--brand-ink)" }}>
              <th className="w-[8mm] py-[1.5mm] text-start font-semibold">#</th>
              <th className="py-[1.5mm] text-start font-semibold">{L.item}</th>
              <th className="py-[1.5mm] text-start font-semibold">{L.unit}</th>
              <th className="py-[1.5mm] text-end font-semibold">{L.qty}</th>
              {def.items.prices && <th className="py-[1.5mm] text-end font-semibold">{L.price}</th>}
              {def.items.prices && <th className="py-[1.5mm] text-end font-semibold">{L.amount}</th>}
              {def.items.condition && <th className="py-[1.5mm] text-start font-semibold">{L.condition}</th>}
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, i) => (
              <tr key={i} className="border-b border-gray-200 align-top">
                <td className="py-[1.5mm] text-gray-500 tabular-nums">{i + 1}</td>
                <td className="py-[1.5mm]">{item.description}</td>
                <td className="py-[1.5mm]">{item.unit}</td>
                <td className="py-[1.5mm] text-end tabular-nums">{item.quantity ? formatNumber(item.quantity, intl, 3) : ""}</td>
                {def.items!.prices && <td className="py-[1.5mm] text-end tabular-nums">{item.unitPrice ? money(item.unitPrice) : ""}</td>}
                {def.items!.prices && <td className="py-[1.5mm] text-end font-medium tabular-nums">{money(totals!.lines[i])}</td>}
                {def.items!.condition && <td className="py-[1.5mm]">{item.condition}</td>}
              </tr>
            ))}
            {doc.items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-[4mm] text-center text-gray-400">
                  —
                </td>
              </tr>
            )}
          </tbody>
          {totals && (
            <tfoot className="text-[10.5pt]">
              {Number(doc.taxRate || 0) > 0 && (
                <>
                  <tr>
                    <td colSpan={5} className="pt-[2mm] text-end text-gray-600">
                      {L.subtotal}
                    </td>
                    <td className="pt-[2mm] text-end tabular-nums">{money(totals.subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="text-end text-gray-600">
                      {L.tax} (<bdi dir="ltr">{formatNumber(doc.taxRate!, intl)}%</bdi>)
                    </td>
                    <td className="text-end tabular-nums">{money(totals.tax)}</td>
                  </tr>
                </>
              )}
              <tr>
                <td colSpan={5} className="pt-[1.5mm] text-end font-semibold">
                  {L.total}
                </td>
                <td className="border-t-2 pt-[1.5mm] text-end text-[12pt] font-semibold tabular-nums" style={{ borderColor: "var(--brand-ink)" }}>
                  {money(totals.total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      )}

      {wordsAmount !== null && wordsAmount > 0 && (
        <p className="mt-[4mm] rounded-[1.5mm] border border-gray-300 bg-gray-50 px-[3mm] py-[2mm] text-[10pt]">
          <span className="text-gray-500">{L.inWords}: </span>
          <span className="font-medium">{amountInWords(wordsAmount, doc.currency, lang)}</span>
        </p>
      )}

      {longFields.map((f) => (
        <section key={f.key} className="mt-[5mm] break-inside-avoid">
          <h2 className="mb-[1mm] text-[10.5pt] font-semibold" style={{ color: "var(--brand-ink)" }}>
            {f.label[lang]}
          </h2>
          <p className="text-[10.5pt] whitespace-pre-wrap">{value(f.key)}</p>
        </section>
      ))}

      <div
        className="mt-[12mm] grid gap-[6mm] break-inside-avoid"
        style={{ gridTemplateColumns: `repeat(${def.signatures.length}, minmax(0, 1fr))` }}
      >
        {def.signatures.map((s, i) => (
          <div key={s.en} className="text-[9.5pt]">
            <p className="font-semibold">{s[lang]}</p>
            {/* The stamp sits inside the box, below the label, never over it. */}
            <div className="relative mt-[2mm] h-[26mm] overflow-hidden border-b border-gray-400">
              {i === def.stampOn && <Stamp profile={profile} className="absolute bottom-[1mm] start-[2mm] max-h-[23mm] max-w-[36mm]" />}
            </div>
            <p className="mt-[1mm] text-gray-500">{L.name}:</p>
            <p className="mt-[3mm] text-gray-500">{L.signature}:</p>
          </div>
        ))}
      </div>
    </div>
  );
}
