import type { ReactNode } from "react";
import { PAPER_LABELS, inLanguage, readableOnWhite, textOn, type CompanyProfile, type DocumentLanguage, type PaperStyle } from "@/lib/branding";
import { cn } from "@/lib/utils";

type PaperProps = {
  profile: CompanyProfile;
  style: PaperStyle;
  lang: DocumentLanguage;
  children?: ReactNode;
  className?: string;
};

/** Phone · email · website, in reading order. */
function contactLine(p: CompanyProfile, lang: DocumentLanguage) {
  const L = PAPER_LABELS[lang];
  return [p.phone && `${L.phone} ${p.phone}`, p.email, p.website].filter(Boolean) as string[];
}
function legalLine(p: CompanyProfile, lang: DocumentLanguage) {
  const L = PAPER_LABELS[lang];
  return [p.registrationNo && `${L.registration}: ${p.registrationNo}`, p.taxNo && `${L.tax}: ${p.taxNo}`].filter(Boolean) as string[];
}

/** Numbers, emails and websites stay left-to-right inside Arabic text. */
const Ltr = ({ children }: { children: ReactNode }) => (
  <bdi dir="ltr" className="whitespace-nowrap">
    {children}
  </bdi>
);
const Joined = ({ parts }: { parts: string[] }) => (
  <>
    {parts.map((part, i) => (
      <span key={part}>
        {i > 0 && <span className="mx-1.5 opacity-50">·</span>}
        <Ltr>{part}</Ltr>
      </span>
    ))}
  </>
);

/**
 * An A4 sheet on the company's letterhead. The body goes in `children`.
 * Pure markup (no hooks), so it renders in the settings preview and on print pages.
 */
export function Paper({ profile, style, lang, children, className }: PaperProps) {
  const brand = profile.brandColor;
  const ink = readableOnWhite(brand);
  const { name, address, footer } = inLanguage(profile, lang);
  const contact = contactLine(profile, lang);
  const legal = legalLine(profile, lang);
  // eslint-disable-next-line @next/next/no-img-element
  const logo = (cls: string) => (profile.logoUrl ? <img src={profile.logoUrl} alt="" className={cn("object-contain", cls)} /> : null);

  return (
    <article
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
      className={cn("paper relative flex min-h-[297mm] w-[210mm] flex-col bg-white text-[11pt] leading-relaxed text-gray-900", className)}
      style={{ ["--brand" as string]: brand, ["--brand-ink" as string]: ink }}
    >
      {style === "classic" && (
        <div className="m-[8mm] flex flex-1 flex-col border-[1.5px] px-[12mm] pt-[10mm] pb-[8mm]" style={{ borderColor: ink }}>
          <header className="text-center">
            {logo("mx-auto mb-2 max-h-[22mm] max-w-[60mm]")}
            <p className="text-[20pt] font-semibold tracking-wide" style={{ color: ink }}>
              {name}
            </p>
            {address && <p className="text-[9.5pt] text-gray-600">{address}</p>}
            {contact.length > 0 && (
              <p className="text-[9.5pt] text-gray-600">
                <Joined parts={contact} />
              </p>
            )}
            <div className="mt-3 border-t-[3px] border-b pb-[2px]" style={{ borderColor: ink }} />
          </header>
          <div className="flex-1 py-[8mm]">{children}</div>
          <footer className="border-t pt-2 text-center text-[8.5pt] text-gray-600" style={{ borderColor: ink }}>
            {footer && <p>{footer}</p>}
            {legal.length > 0 && (
              <p>
                <Joined parts={legal} />
              </p>
            )}
          </footer>
        </div>
      )}

      {style === "modern" && (
        <>
          <header className="flex items-center gap-[6mm] px-[14mm] py-[8mm]" style={{ backgroundColor: brand, color: textOn(brand) }}>
            {profile.logoUrl && <div className="shrink-0 rounded-md bg-white p-[2mm]">{logo("max-h-[18mm] max-w-[40mm]")}</div>}
            <div className="min-w-0 flex-1">
              <p className="text-[18pt] leading-tight font-semibold">{name}</p>
              {address && <p className="text-[9.5pt] opacity-90">{address}</p>}
            </div>
            {contact.length > 0 && (
              <div className="shrink-0 text-end text-[9pt] leading-snug opacity-90">
                {contact.map((c) => (
                  <p key={c}>
                    <Ltr>{c}</Ltr>
                  </p>
                ))}
              </div>
            )}
          </header>
          <div className="flex-1 px-[14mm] py-[10mm]">{children}</div>
          <footer className="px-[14mm] pb-[6mm] text-[8.5pt] text-gray-600">
            <div className="flex flex-wrap justify-between gap-2 border-t pt-2">
              <span>{footer}</span>
              {legal.length > 0 && (
                <span>
                  <Joined parts={legal} />
                </span>
              )}
            </div>
          </footer>
          <div className="h-[4mm]" style={{ backgroundColor: brand }} />
        </>
      )}

      {style === "minimal" && (
        <div className="flex flex-1 flex-col px-[18mm] pt-[14mm] pb-[10mm]">
          <header className="flex items-start justify-between gap-[8mm] border-b border-gray-200 pb-[5mm]">
            <div className="flex min-w-0 items-center gap-[4mm]">
              {logo("max-h-[14mm] max-w-[34mm]")}
              <div className="min-w-0">
                <p className="text-[14pt] font-semibold">{name}</p>
                {address && <p className="text-[9pt] text-gray-500">{address}</p>}
              </div>
            </div>
            {contact.length > 0 && (
              <div className="shrink-0 text-end text-[8.5pt] leading-snug text-gray-500">
                {contact.map((c) => (
                  <p key={c}>
                    <Ltr>{c}</Ltr>
                  </p>
                ))}
              </div>
            )}
          </header>
          <div className="flex-1 py-[10mm]">{children}</div>
          <footer className="flex flex-wrap justify-between gap-2 text-[8pt] text-gray-500">
            <span>{footer}</span>
            {legal.length > 0 && (
              <span>
                <Joined parts={legal} />
              </span>
            )}
          </footer>
        </div>
      )}
    </article>
  );
}

/** The company stamp / signature image, if any (placed in signature boxes). */
export function Stamp({ profile, className }: { profile: CompanyProfile; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return profile.stampUrl ? <img src={profile.stampUrl} alt="" className={cn("max-h-[28mm] max-w-[40mm] object-contain opacity-90", className)} /> : null;
}
