"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/auth-context";

function safeRedirectPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/dashboard";
  }
  if (raw === "/login" || raw.startsWith("/login")) {
    return "/dashboard";
  }
  return raw;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, login } = useAuth();

  const nextPath = safeRedirectPath(searchParams.get("next"));
  const roleHint = searchParams.get("role");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(nextPath);
    }
  }, [isLoading, user, router, nextPath]);

  const handleSignIn = async (role: "user" | "admin" | "superadmin") => {
    setError(null);
    setSubmitting(true);
    try {
      await login(role);
      router.replace(nextPath);
    } catch {
      setError("Could not sign you in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-md">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      <div className="mb-8 flex items-center justify-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
          <Layers className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="font-heading text-2xl font-bold tracking-tight text-secondary-foreground">
          Courtly
        </span>
      </div>

      <Card className="border-border/60 shadow-xl shadow-primary/5">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="font-heading text-2xl">Sign in</CardTitle>
          <CardDescription>
            Use your account to book courts, join sessions, and manage
            registrations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-center text-xs text-muted-foreground">
            Demo mode: real email/password sign-in will connect to Supabase
            later. For now, sign in with the buttons below.
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          {error ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              className="w-full font-heading font-semibold"
              size="lg"
              disabled={submitting}
              onClick={() => void handleSignIn("user")}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full font-heading font-semibold"
              disabled={submitting}
              onClick={() => void handleSignIn("admin")}
            >
              Sign in as admin
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full font-heading font-semibold"
              disabled={submitting}
              onClick={() => void handleSignIn("superadmin")}
            >
              Sign in as superadmin
            </Button>
          </div>

          {roleHint === "admin" ? (
            <p className="text-center text-xs text-muted-foreground">
              Tip: you opened this page with admin intent — use &quot;Sign in as
              admin&quot; for facility tools.
            </p>
          ) : null}
          {roleHint === "superadmin" ? (
            <p className="text-center text-xs text-muted-foreground">
              Tip: use &quot;Sign in as superadmin&quot; for the platform
              console and full directory access.
            </p>
          ) : null}

          <p className="text-center text-xs text-muted-foreground">
            After Supabase is wired, this form will validate email and password
            here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative min-h-screen bg-secondary px-4 py-12">
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-primary blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-chart-3 blur-[80px]" />
      </div>
      <div className="relative">
        <Suspense
          fallback={
            <div className="flex min-h-[60vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          }
        >
          <LoginContent />
        </Suspense>
      </div>
    </div>
  );
}
