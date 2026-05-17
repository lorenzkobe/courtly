"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
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
import { courtlyApi } from "@/lib/api/courtly-client";
import { EMAIL_REGEX } from "@/lib/validation/person-fields";

const GENERIC_DONE_MESSAGE =
  "If an account exists for that email, we sent a link to reset your password.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();

  async function handleSubmit() {
    setError(null);
    setDoneMessage(null);
    setSubmitting(true);
    try {
      const res = await courtlyApi.auth.forgotPassword({ email: normalizedEmail });
      setDoneMessage(res.data?.message || GENERIC_DONE_MESSAGE);
    } catch {
      setError("Could not send reset email. Try again later.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-md px-4 py-16">
      <Link
        href="/login"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to sign in
      </Link>

      <Card className="border-border/60 shadow-xl shadow-primary/5">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="font-heading text-2xl">Forgot password</CardTitle>
          <CardDescription>
            We will email you a link to choose a new password. It opens the same secure page we use
            for new invitations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting || !!doneMessage}
            />
            {email.length > 0 && !EMAIL_REGEX.test(normalizedEmail) ? (
              <p className="text-xs text-destructive">Please enter a valid email address.</p>
            ) : null}
          </div>
          {error ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {doneMessage ? (
            <p className="text-center text-sm text-muted-foreground" role="status">
              {doneMessage}
            </p>
          ) : null}
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              className="w-full font-heading font-semibold"
              size="lg"
              disabled={
                submitting || !!doneMessage || !EMAIL_REGEX.test(normalizedEmail)
              }
              onClick={() => void handleSubmit()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send reset link"
              )}
            </Button>
            {doneMessage ? (
              <Button variant="outline" asChild className="w-full">
                <Link href="/login">Return to sign in</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
