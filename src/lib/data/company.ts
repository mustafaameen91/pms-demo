import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companyProfiles, organization } from "@/lib/db/schema";
import { isPaperStyle, type CompanyProfile } from "@/lib/branding";

/** A workspace's letterhead (defaults when it hasn't been set up yet). Caller authorizes. */
export const getCompanyProfile = cache(async (workspaceId: string): Promise<CompanyProfile & { configured: boolean }> => {
  const [[row], [org]] = await Promise.all([
    db.select().from(companyProfiles).where(eq(companyProfiles.workspaceId, workspaceId)).limit(1),
    db.select({ name: organization.name }).from(organization).where(eq(organization.id, workspaceId)).limit(1),
  ]);
  // Cache-busting version, so a new logo shows straight away.
  const v = row?.updatedAt ? row.updatedAt.getTime() : 0;
  const image = (kind: "logo" | "stamp", path: string | null | undefined) =>
    path ? `/api/files/branding/${workspaceId}/${kind}?v=${v}` : null;
  return {
    configured: Boolean(row),
    nameEn: row?.nameEn || org?.name || "",
    nameAr: row?.nameAr || "",
    addressEn: row?.addressEn ?? null,
    addressAr: row?.addressAr ?? null,
    phone: row?.phone ?? null,
    email: row?.email ?? null,
    website: row?.website ?? null,
    registrationNo: row?.registrationNo ?? null,
    taxNo: row?.taxNo ?? null,
    footerEn: row?.footerEn ?? null,
    footerAr: row?.footerAr ?? null,
    brandColor: row?.brandColor ?? "#0D9488",
    logoUrl: image("logo", row?.logoPath),
    stampUrl: image("stamp", row?.stampPath),
    defaultStyle: isPaperStyle(row?.defaultStyle) ? row.defaultStyle : "classic",
    defaultLanguage: row?.defaultLanguage === "en" ? "en" : "ar",
  };
});
