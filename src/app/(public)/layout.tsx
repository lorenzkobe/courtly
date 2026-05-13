import Link from "next/link";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import GuestPaymentGate from "@/components/payments/GuestPaymentGate";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-90"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Layers className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-heading text-lg font-bold tracking-tight text-foreground">
              Courtly
            </span>
          </Link>
          <Button variant="ghost" size="sm" className="font-medium" asChild>
            <Link href="/login">Sign In</Link>
          </Button>
        </div>
      </header>
      <main>{children}</main>
      <GuestPaymentGate />
    </div>
  );
}
