"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function safeAuthRedirectPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw === "/login" || raw.startsWith("/login")) return "/dashboard";
  if (raw.startsWith("/auth/callback")) return "/dashboard";
  return raw;
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const code = searchParams.get("code");
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

    let cancelled = false;

    async function run() {
      const supabase = createSupabaseBrowserClient();
      try {
        if (code) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) {
            const {
              data: { session: existing },
            } = await supabase.auth.getSession();
            if (!existing) {
              if (!cancelled) {
                router.replace(
                  `/login?error=${encodeURIComponent(exchangeErr.message)}`,
                );
              }
              return;
            }
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          if (!cancelled) {
            router.replace(
              `/login?error=${encodeURIComponent(
                "Could not sign you in. Open the link from your email again, or request a new invitation or password reset.",
              )}`,
            );
          }
          return;
        }

        if (!cancelled) router.replace(next);
      } catch (e) {
        if (!cancelled) {
          router.replace(
            `/login?error=${encodeURIComponent(
              e instanceof Error ? e.message : "Something went wrong.",
            )}`,
          );
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, code, nextRaw, oauthError]);

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
