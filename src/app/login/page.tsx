"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import axios from "axios";
import { ArrowLeft, CalendarIcon, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { homePathForRole } from "@/lib/auth/management";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";
import { isValidPhMobile } from "@/lib/validation/person-fields";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_REGEX = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;

function isValidName(value: string) {
  const trimmed = value.trim();
  if (!NAME_REGEX.test(trimmed)) return false;
  const letterCount = trimmed.replace(/[^A-Za-z]/g, "").length;
  return letterCount >= 2;
}

function parseIsoToLocalDate(iso: string): Date | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

function safeRedirectPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }
  if (raw === "/login" || raw.startsWith("/login")) {
    return null;
  }
  return raw;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, login, signup } = useAuth();

  const nextPath = safeRedirectPath(searchParams.get("next"));

  // Pre-fill from guest booking redirect (?register=1&email=X&first_name=X&last_name=X&phone=X)
  const prefillRegister = searchParams.get("register") === "1";
  const prefillEmail = searchParams.get("email") ?? "";
  const prefillFirstName = searchParams.get("first_name") ?? "";
  const prefillLastName = searchParams.get("last_name") ?? "";
  const prefillPhone = searchParams.get("phone") ?? "";

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState(prefillFirstName);
  const [lastName, setLastName] = useState(prefillLastName);
  const [birthdate, setBirthdate] = useState("");
  const [mobileNumber, setMobileNumber] = useState(prefillPhone);
  const [authMode, setAuthMode] = useState<"signin" | "signup">(
    prefillRegister ? "signup" : "signin",
  );
  const [birthdateOpen, setBirthdateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedFirstName = firstName.trim();
  const trimmedLastName = lastName.trim();
  const trimmedMobile = mobileNumber.trim();

  const passwordChecks = {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  const isPasswordValid = Object.values(passwordChecks).every(Boolean);
  const isConfirmPasswordValid = password.length > 0 && password === confirmPassword;
  const isSignInFormValid =
    EMAIL_REGEX.test(normalizedEmail) && password.length > 0;
  const isSignUpFormValid =
    EMAIL_REGEX.test(normalizedEmail) &&
    isValidName(trimmedFirstName) &&
    isValidName(trimmedLastName) &&
    !!birthdate &&
    isValidPhMobile(trimmedMobile) &&
    isPasswordValid &&
    isConfirmPasswordValid;
  const selectedBirthdate = parseIsoToLocalDate(birthdate);

  const resetAuthFields = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFirstName("");
    setLastName("");
    setBirthdate("");
    setMobileNumber("");
    setBirthdateOpen(false);
  };

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(nextPath ?? homePathForRole(user.role));
    }
  }, [isLoading, user, router, nextPath]);

  const handleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
    } catch (err) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.error === "string") {
        setError(err.response.data.error);
      } else {
        setError("Could not sign you in. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signup({
        email: normalizedEmail,
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        birthdate,
        mobileNumber: trimmedMobile,
        password,
        confirmPassword,
      });
      toast.success(
        `We sent a verification email to ${normalizedEmail}. Check your inbox to confirm your account.`,
      );
      resetAuthFields();
      setAuthMode("signin");
    } catch (err) {
      if (axios.isAxiosError(err) && typeof err.response?.data?.error === "string") {
        setError(err.response.data.error);
      } else {
        setError("Could not create your account. Please check your details and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (authMode === "signin") {
      if (!isSignInFormValid) return;
      void handleSignIn();
      return;
    }
    if (!isSignUpFormValid) return;
    void handleSignUp();
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

      <div className="mb-8 flex flex-col items-center gap-1 text-center">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Layers className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-heading text-2xl font-bold tracking-tight text-secondary-foreground">
            Courtly
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Book courts, tournaments & open play
        </p>
      </div>

      <Card className="border-border/60 shadow-xl shadow-primary/5">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="font-heading text-2xl">
            {authMode === "signin" ? "Sign in" : "Create account"}
          </CardTitle>
          <CardDescription>
            {authMode === "signin"
              ? "Use your account to book courts, join sessions, and manage registrations."
              : "Create your account to start booking courts and joining sessions."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <Button
              type="button"
              variant={authMode === "signin" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setAuthMode("signin");
                setError(null);
              }}
              disabled={submitting}
            >
              Sign in
            </Button>
            <Button
              type="button"
              variant={authMode === "signup" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setAuthMode("signup");
                setError(null);
              }}
              disabled={submitting}
            >
              Sign up
            </Button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {authMode === "signup" ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      autoComplete="given-name"
                      placeholder="Juan"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      disabled={submitting}
                    />
                    {firstName.length > 0 && !isValidName(trimmedFirstName) ? (
                      <p className="text-xs text-destructive">
                        First name must have at least 2 letters and may include spaces.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      autoComplete="family-name"
                      placeholder="Dela Cruz"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      disabled={submitting}
                    />
                    {lastName.length > 0 && !isValidName(trimmedLastName) ? (
                      <p className="text-xs text-destructive">
                        Last name must have at least 2 letters and may include spaces.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birthdate">Birthdate</Label>
                  <Popover open={birthdateOpen} onOpenChange={setBirthdateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="birthdate"
                        type="button"
                        variant="outline"
                        disabled={submitting}
                        className={cn(
                          "h-11 w-full justify-start gap-2.5 rounded-2xl border-border/80 bg-card px-3 text-left text-sm font-normal shadow-sm transition-[box-shadow,background-color] hover:bg-muted/50 hover:shadow-md",
                          !birthdate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <span className="truncate">
                          {selectedBirthdate
                            ? format(selectedBirthdate, "MMMM d, yyyy")
                            : "Select birthdate"}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="z-120 w-auto overflow-hidden rounded-2xl border-border/80 bg-card p-0 shadow-xl"
                      align="start"
                    >
                      <Calendar
                        birthdatePicker
                        mode="single"
                        selected={selectedBirthdate}
                        onSelect={(date) => {
                          if (!date) return;
                          if (date > new Date()) return;
                          setBirthdate(format(date, "yyyy-MM-dd"));
                          setBirthdateOpen(false);
                        }}
                        disabled={(date) => date > new Date()}
                        className="w-full min-w-0"
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            ) : null}

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
              {email.length > 0 && !EMAIL_REGEX.test(normalizedEmail) ? (
                <p className="text-xs text-destructive">
                  Please enter a valid email address.
                </p>
              ) : null}
            </div>
            {authMode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="mobileNumber">Mobile number (PH)</Label>
                <Input
                  id="mobileNumber"
                  type="tel"
                  autoComplete="tel"
                  placeholder="09171234567 or +639171234567"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  disabled={submitting}
                />
                {mobileNumber.length > 0 && !isValidPhMobile(trimmedMobile) ? (
                  <p className="text-xs text-destructive">
                    Enter a valid Philippine mobile number.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="password">Password</Label>
                {authMode === "signin" ? (
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                ) : null}
              </div>
              <Input
                id="password"
                type="password"
                autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>
            {authMode === "signup" ? (
              <>
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                  <p className="mb-2 font-medium text-foreground">
                    Password requirements
                  </p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li className={passwordChecks.minLength ? "text-emerald-600" : ""}>
                      {passwordChecks.minLength ? "Pass" : "Pending"} - At least 8
                      characters
                    </li>
                    <li className={passwordChecks.uppercase ? "text-emerald-600" : ""}>
                      {passwordChecks.uppercase ? "Pass" : "Pending"} - 1 uppercase
                      letter
                    </li>
                    <li className={passwordChecks.lowercase ? "text-emerald-600" : ""}>
                      {passwordChecks.lowercase ? "Pass" : "Pending"} - 1 lowercase
                      letter
                    </li>
                    <li className={passwordChecks.number ? "text-emerald-600" : ""}>
                      {passwordChecks.number ? "Pass" : "Pending"} - 1 number
                    </li>
                    <li className={passwordChecks.symbol ? "text-emerald-600" : ""}>
                      {passwordChecks.symbol ? "Pass" : "Pending"} - 1 symbol
                    </li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={submitting}
                  />
                  {confirmPassword.length > 0 && !isConfirmPasswordValid ? (
                    <p className="text-xs text-destructive">
                      Password and confirm password must match.
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
            {error ? (
              <p className="text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full font-heading font-semibold"
                size="lg"
                disabled={
                  submitting ||
                  (authMode === "signin" ? !isSignInFormValid : !isSignUpFormValid)
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {authMode === "signin" ? "Signing in…" : "Creating account…"}
                  </>
                ) : (
                  authMode === "signin" ? "Sign in" : "Create account"
                )}
              </Button>
            </div>
          </form>
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
