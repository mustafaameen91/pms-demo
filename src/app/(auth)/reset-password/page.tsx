import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Choose a new password") };
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;
  const invalid = query.error === "INVALID_TOKEN";
  return <ResetPasswordForm token={invalid ? null : token} />;
}
