import { AuthGuard } from "@/components/auth/auth-guard";
import AppLayout from "@/components/layout/AppLayout";

export default function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AppLayout>{children}</AppLayout>
    </AuthGuard>
  );
}
