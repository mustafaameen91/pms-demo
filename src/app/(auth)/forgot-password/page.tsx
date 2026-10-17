import type { Metadata } from "next";
import { emailDeliveryEnabled } from "@/lib/email";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm emailEnabled={emailDeliveryEnabled} />;
}
