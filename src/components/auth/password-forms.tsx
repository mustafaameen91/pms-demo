"use client";

import { useState } from "react";
import Link from "next/link";
import { Info, Loader2, MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/i18n/client";

function BackToLogin() {
  const t = useT();
  return (
    <p className="mt-6 text-center text-sm text-muted-foreground">
      <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
        {t("Back to log in")}
      </Link>
    </p>
  );
}

export function ForgotPasswordForm({ emailEnabled }: { emailEnabled: boolean }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email"));
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    if (error) setError(error.message ?? t("Something went wrong. Please try again."));
    else setSent(true);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          <h1>{t("Forgot your password?")}</h1>
        </CardTitle>
        <CardDescription>{t("Enter your email and we'll send you a link to choose a new one.")}</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div role="status" className="grid gap-3 text-sm">
            <p className="flex gap-2">
              <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {t("If an account exists for that email, a reset link has been created. It's valid for 1 hour.")}
            </p>
            {!emailEnabled && <EmailNotConfiguredNote />}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">{t("Email")}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus className="h-10" />
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending} className="h-10 w-full">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("Send reset link")}
            </Button>
            {!emailEnabled && <EmailNotConfiguredNote />}
          </form>
        )}
        <BackToLogin />
      </CardContent>
    </Card>
  );
}

function EmailNotConfiguredNote() {
  const t = useT();
  return (
    <p className="flex gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {t(
        "Email sending isn't set up on this server yet, so the link won't arrive by email. It is printed in the server's terminal — ask your administrator for it.",
      )}
    </p>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
          <h1>{t("Link expired or invalid")}</h1>
        </CardTitle>
          <CardDescription>{t("Reset links work once and expire after 1 hour.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="h-10 w-full">
            <Link href="/forgot-password">{t("Get a new link")}</Link>
          </Button>
          <BackToLogin />
        </CardContent>
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword !== String(form.get("confirm"))) {
      setError(t("The two passwords don't match."));
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword, token: token! });
    setPending(false);
    if (error) setError(error.message ?? t("This link has expired. Please request a new one."));
    else setDone(true);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          <h1>{done ? t("Password changed") : t("Choose a new password")}</h1>
        </CardTitle>
        {done && <CardDescription>{t("You can now log in with your new password.")}</CardDescription>}
      </CardHeader>
      <CardContent>
        {done ? (
          <Button asChild className="h-10 w-full">
            <Link href="/login">{t("Log in")}</Link>
          </Button>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="password">{t("New password")}</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus className="h-10" aria-describedby="pw-help" />
              <p id="pw-help" className="text-xs text-muted-foreground">{t("At least 8 characters.")}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm">{t("Repeat new password")}</Label>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="h-10" />
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending} className="h-10 w-full">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("Save new password")}
            </Button>
          </form>
        )}
        {!done && <BackToLogin />}
      </CardContent>
    </Card>
  );
}
