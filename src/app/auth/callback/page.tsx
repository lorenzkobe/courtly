"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function safeAuthRedirectPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw === "/login" || raw.startsWith("/login")) return "/dashboard";
  if (raw.startsWith("/auth/callback")) return "/dashboard";
  return raw;
}

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const nextRaw = searchParams.get("next");
  const oauthError =
    searchParams.get("error_description")?.trim() ||
    searchParams.get("error")?.trim();

  useEffect(() => {
    const next = safeAuthRedirectPath(nextRaw);

    if (oauthError) {
      router.replace(`/login?error=${encodeURIComponent(oauthError)}`);
      return;
    }

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    function succeed() {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe?.();
      window.location.replace(next);
    }

    function fail(message: string) {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe?.();
      router.replace(`/login?error=${encodeURIComponent(message)}`);
    }

    async function run() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        fail(
          "Supabase is not configured in the browser (missing NEXT_PUBLIC_SUPABASE_URL or publishable key).",
        );
        return;
      }

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) succeed();
      });
      unsubscribe = () => sub.subscription.unsubscribe();

      timeoutId = setTimeout(() => {
        fail(
          "Could not sign you in. Open the link from your email again, or request a new invitation or password reset.",
        );
      }, 5000);

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            const { data } = await supabase.auth.getSession();
            if (!data.session) {
              fail(error.message);
              return;
            }
          }
        } else if (tokenHash && typeParam && EMAIL_OTP_TYPES.has(typeParam as EmailOtpType)) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: typeParam as EmailOtpType,
          });
          if (error) {
            fail(error.message);
            return;
          }
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) succeed();
      } catch (e) {
        fail(e instanceof Error ? e.message : "Something went wrong.");
      }
    }

    void run();
    return () => {
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe?.();
    };
  }, [router, code, tokenHash, typeParam, nextRaw, oauthError]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
