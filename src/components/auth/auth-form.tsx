"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isSignup = mode === "signup";
  // Only allow same-site relative redirects.
  const nextParam = searchParams.get("next");
  const safeNext = nextParam?.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  // A brand-new account can't be in any workspace yet, so after sign-up only an
  // invite link is worth returning to; anything else goes to onboarding via "/".
  const next = isSignup && !safeNext.startsWith("/invite/") ? "/" : safeNext;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const { error } = isSignup
      ? await authClient.signUp.email({ name: String(form.get("name")).trim(), email, password })
      : await authClient.signIn.email({ email, password });

    if (error) {
      setError(error.message ?? "Something went wrong. Please try again.");
      setPending(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
        </CardTitle>
        <CardDescription>
          {isSignup ? "Start organizing your team's work." : "Log in to continue to your workspace."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          {isSignup && (
            <div className="grid gap-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" autoComplete="name" className="h-10" required minLength={2} autoFocus />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="h-10"
              required
              autoFocus={!isSignup}
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {!isSignup && (
                <Link href="/forgot-password" className="text-xs text-primary underline-offset-4 hover:underline">
                  Forgot password?
                </Link>
              )}
            </div>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isSignup ? "new-password" : "current-password"}
                required
                minLength={8}
                aria-describedby={isSignup ? "password-help" : undefined}
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {isSignup && (
              <p id="password-help" className="text-xs text-muted-foreground">
                At least 8 characters.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="h-10 w-full">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isSignup ? "Create account" : "Log in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account? " : "New here? "}
          <Link
            href={`${isSignup ? "/login" : "/signup"}${safeNext !== "/" ? `?next=${encodeURIComponent(safeNext)}` : ""}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {isSignup ? "Log in" : "Create an account"}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
