import { RequireRole } from "@/components/auth/require-role";
import { COURT_ADMIN_ROLES } from "@/lib/auth/management";

export default function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireRole allow={COURT_ADMIN_ROLES}>{children}</RequireRole>;
}
