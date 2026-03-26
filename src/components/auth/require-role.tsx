"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { homePathForRole } from "@/lib/auth/management";
import type { SessionUser } from "@/lib/types/courtly";

export function RequireRole({
  allow,
  children,
}: {
  /** Prefer module-level constants (e.g. `COURT_ADMIN_ROLES`) so this reference stays stable. */
  allow: readonly SessionUser["role"][];
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!allow.includes(user.role)) {
      router.replace(homePathForRole(user.role));
    }
  }, [allow, user, isLoading, router]);

  if (isLoading || !user || !allow.includes(user.role)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
