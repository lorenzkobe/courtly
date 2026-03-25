import { RequireRole } from "@/components/auth/require-role";
import { SUPERADMIN_ROLES } from "@/lib/auth/management";

export default function SuperadminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireRole allow={SUPERADMIN_ROLES}>{children}</RequireRole>;
}
