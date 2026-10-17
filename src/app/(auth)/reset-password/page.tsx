import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;
  const invalid = query.error === "INVALID_TOKEN";
  return <ResetPasswordForm token={invalid ? null : token} />;
}
