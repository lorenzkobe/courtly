"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Building2,
  Calendar,
  Crown,
  FileText,
  Flag,
  PhilippinePeso,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Trophy,
  UserCog,
  UserRound,
  Users,
  X,
} from "lucide-react";
import GlobalPendingPaymentGate from "@/components/payments/GlobalPendingPaymentGate";
import TermsAcceptanceGate from "@/components/admin/TermsAcceptanceGate";
import NotificationBell from "@/components/notifications/NotificationBell";
import SportPicker from "@/components/shared/SportPicker";
import { Button } from "@/components/ui/button";
import { courtlyApi } from "@/lib/api/courtly-client";
import { homePathForRole } from "@/lib/auth/management";
import { cn, formatStatusLabel } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { isFeaturePreviewUser } from "@/lib/auth/feature-preview";
import type { SessionUser } from "@/lib/types/courtly";
import Image from "next/image";

const PLAYER_NAV = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/courts", label: "Book Courts", icon: Calendar },
  { path: "/tournaments", label: "Tournaments", icon: Trophy },
  { path: "/open-play", label: "Open Play", icon: Users },
  { path: "/my-bookings", label: "My Bookings", icon: BookOpen },
] as const;

type NavEntry = (typeof PLAYER_NAV)[number] | {
  path: string;
  label: string;
  icon: LucideIcon;
};

function venueAdminNav(): NavEntry[] {
  return [
    { path: "/admin/venues", label: "Venues", icon: Building2 },
    { path: "/admin/bookings", label: "Court bookings", icon: Calendar },
    { path: "/admin/revenue", label: "Revenue", icon: PhilippinePeso },
    { path: "/admin/billing", label: "Billing", icon: Receipt },
  ];
}

function platformSuperadminNav(): NavEntry[] {
  return [
    { path: "/superadmin", label: "Overview", icon: Crown },
    {
      path: "/superadmin/venues",
      label: "Venues",
      icon: Building2,
    },
    { path: "/superadmin/users", label: "Users", icon: UserCog },
    {
      path: "/superadmin/revenue",
      label: "Billing",
      icon: Receipt,
    },
    {
      path: "/superadmin/moderation",
      label: "Flagged reviews",
      icon: Flag,
    },
    {
      path: "/superadmin/terms",
      label: "Terms & Conditions",
      icon: FileText,
    },
  ];
}

type SidebarModel = {
  /** When set, sidebar shows only this section (admin / superadmin consoles). */
  sectionLabel: string | null;
  items: NavEntry[];
};

/** Longest matching nav path wins so `/superadmin` does not stay active on `/superadmin/venues`. */
function activeNavPath(pathname: string, paths: readonly string[]) {
  let best: string | null = null;
  for (const p of paths) {
    if (pathname === p || pathname.startsWith(`${p}/`)) {
      if (!best || p.length > best.length) best = p;
    }
  }
  return best;
}

/** Sidebar by role: players get booking UI; staff get only venue or operations — no player tabs. */
function sidebarForRole(role: SessionUser["role"] | undefined): SidebarModel {
  switch (role) {
    case "admin":
      return {
        sectionLabel: "Your venue",
        items: venueAdminNav(),
      };
    case "superadmin":
      return {
        sectionLabel: "Platform",
        items: platformSuperadminNav(),
      };
    case "user":
    default:
      return { sectionLabel: null, items: [...PLAYER_NAV] };
  }
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const { user } = useAuth();
  const homePath = homePathForRole(user?.role);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const sidebar = useMemo(() => {
    const base = sidebarForRole(user?.role);
    if (user?.role === "user" && !isFeaturePreviewUser(user.email)) {
      return {
        ...base,
        items: base.items.filter(
          (item) => item.path !== "/tournaments" && item.path !== "/open-play",
        ),
      };
    }
    return base;
  }, [user?.role, user?.email]);
  const navItems = sidebar.items;
  const showSportPicker = sidebar.sectionLabel === null;

  const navPaths = useMemo(
    () => navItems.map((navItem) => navItem.path),
    [navItems],
  );
  const currentNavPath = useMemo(
    () => activeNavPath(pathname, navPaths),
    [pathname, navPaths],
  );

  const signOut = () => {
    void (async () => {
      try {
        await courtlyApi.auth.logout();
      } finally {
        window.location.replace("/");
      }
    })();
  };

  const linkClass = (itemPath: string) => {
    const isActive = currentNavPath === itemPath;
    return cn(
      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
      isActive
        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-primary/20"
        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col overflow-y-auto bg-secondary">
          <Link
            href={homePath}
            className="flex items-center gap-3 border-b border-sidebar-border px-6 py-6 transition-opacity hover:opacity-90"
          >
            <Image
              src="/courtly-logo.svg"
              alt="Courtly logo"
              width={42}
              height={42}
            />
            <div>
              <h1 className="font-heading text-lg font-bold tracking-tight text-secondary-foreground">
                Courtly
              </h1>
              <p className="text-xs text-muted-foreground">
                Book courts, tournaments & open play
              </p>
            </div>
          </Link>

          <nav className="flex-1 space-y-1 px-3 py-4">
            {sidebar.sectionLabel ? (
              <p className="px-4 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {sidebar.sectionLabel}
              </p>
            ) : null}
            {sidebar.items.map((item) => (
              <Link key={item.path} href={item.path} className={linkClass(item.path)}>
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="space-y-2 border-t border-sidebar-border px-4 py-4">
            {user ? (
              <Link
                href="/profile"
                className="mb-1 block rounded-lg px-2 py-1 transition-colors hover:bg-sidebar-accent"
              >
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {user.full_name || user.email}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
                <p className="mt-1 text-[10px] font-medium tracking-wide text-primary/90">
                  {formatStatusLabel(user.role)}
                </p>
              </Link>
            ) : null}
            <button
              type="button"
              onClick={signOut}
              className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-sm text-muted-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>
        </div>
      </aside>

      <div className="fixed left-0 right-0 top-0 z-50 border-b border-sidebar-border bg-secondary/95 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href={homePath} className="flex items-center gap-2">
            <Image
              src="/courtly-logo.svg"
              alt="Courtly logo"
              width={42}
              height={42}
            />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="font-heading font-bold text-secondary-foreground">
                Courtly
              </span>
              <span className="truncate text-[10px] font-medium text-muted-foreground">
                Book courts, tournaments & open play
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {isDesktop === false ? <NotificationBell className="text-secondary-foreground" /> : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="text-secondary-foreground"
            >
              {mobileOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
        {mobileOpen ? (
          <nav className="max-h-[calc(100vh-8rem)] space-y-1 overflow-y-auto px-3 pb-3">
            {navItems.map((item) => {
              const isActive = currentNavPath === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/profile"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <UserRound className="h-5 w-5" /> Profile
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </nav>
        ) : null}
      </div>

      <main className="lg:pl-64">
        <div className="min-h-screen pt-16 lg:pt-0">
          {showSportPicker ? (
            <div className="hidden items-center justify-between border-b border-border bg-background px-4 py-2.5 sm:px-6 lg:flex lg:sticky lg:top-0 lg:z-30 lg:bg-background/95 lg:py-3 lg:backdrop-blur supports-backdrop-filter:lg:bg-background/80">
              <SportPicker layout="toolbar" id="app-shell-sport" />
              {isDesktop !== false ? <NotificationBell /> : null}
            </div>
          ) : (
            <div className="hidden justify-end border-b border-border bg-background px-4 py-2.5 sm:px-6 lg:flex lg:sticky lg:top-0 lg:z-30 lg:bg-background/95 lg:py-3 lg:backdrop-blur supports-backdrop-filter:lg:bg-background/80">
              {isDesktop !== false ? <NotificationBell /> : null}
            </div>
          )}
          {children}
        </div>
      </main>
      <GlobalPendingPaymentGate />
      <TermsAcceptanceGate />
    </div>
  );
}
