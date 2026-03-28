"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import axios from "axios";
import { Loader2 } from "lucide-react";
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
import { courtlyApi } from "@/lib/api/courtly-client";
import { getPasswordValidation } from "@/lib/validation/password";

export default function SetPasswordPage() {
  const router = useRouter();
  const { user, isLoading, refreshSession } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordChecks = getPasswordValidation(password);
  const isPasswordValid = Object.values(passwordChecks).every(Boolean);
  const isConfirmValid = password.length > 0 && password === confirmPassword;

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await courtlyApi.auth.setPassword({ password, confirmPassword });
      await refreshSession();
      router.replace("/dashboard");
    } catch (err) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.error === "string") {
        setError(err.response.data.error);
      } else {
        setError("Could not save your password. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">Sign in required</CardTitle>
            <CardDescription>
              Open the link from your invitation or password-reset email, or sign in below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full font-heading">
              <Link href="/login">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <Card className="border-border/60 shadow-xl shadow-primary/5">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="font-heading text-2xl">Choose your password</CardTitle>
          <CardDescription>
            Set a password for <span className="font-medium text-foreground">{user.email}</span> so
            you can sign in next time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="new-password">Password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <p className="mb-2 font-medium text-foreground">Password requirements</p>
            <ul className="space-y-1 text-muted-foreground">
              <li className={passwordChecks.minLength ? "text-emerald-600" : ""}>
                {passwordChecks.minLength ? "Pass" : "Pending"} — At least 8 characters
              </li>
              <li className={passwordChecks.uppercase ? "text-emerald-600" : ""}>
                {passwordChecks.uppercase ? "Pass" : "Pending"} — 1 uppercase letter
              </li>
              <li className={passwordChecks.lowercase ? "text-emerald-600" : ""}>
                {passwordChecks.lowercase ? "Pass" : "Pending"} — 1 lowercase letter
              </li>
              <li className={passwordChecks.number ? "text-emerald-600" : ""}>
                {passwordChecks.number ? "Pass" : "Pending"} — 1 number
              </li>
              <li className={passwordChecks.symbol ? "text-emerald-600" : ""}>
                {passwordChecks.symbol ? "Pass" : "Pending"} — 1 symbol
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirm password</Label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
            />
            {confirmPassword.length > 0 && !isConfirmValid ? (
              <p className="text-xs text-destructive">
                Password and confirm password must match.
              </p>
            ) : null}
          </div>
          {error ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            className="w-full font-heading font-semibold"
            size="lg"
            disabled={submitting || !isPasswordValid || !isConfirmValid}
            onClick={() => void handleSubmit()}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save password & continue"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
