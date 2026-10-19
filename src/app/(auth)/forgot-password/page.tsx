import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { emailDeliveryEnabled } from "@/lib/email";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Forgot password") };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm emailEnabled={emailDeliveryEnabled} />;
}
