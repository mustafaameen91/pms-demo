import { Suspense } from "react";
import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { AuthForm } from "@/components/auth/auth-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Log in") };
}

export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
