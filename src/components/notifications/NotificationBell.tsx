"use client";

import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { courtlyApi } from "@/lib/api/courtly-client";
import { useAuth } from "@/lib/auth/auth-context";
import { NOTIFICATIONS_QUERY_KEY } from "@/lib/notifications/query-key";
import { useNotificationRealtime } from "@/lib/notifications/use-notification-realtime";
import { isSupabasePublicConfigured } from "@/lib/supabase/env";
import type { Notification } from "@/lib/notifications/types";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function NotificationRow({
  item,
  onMarkRead,
  disabled,
}: {
  item: Notification;
  onMarkRead: (id: string) => void;
  disabled: boolean;
}) {
  const inner = (
    <>
      <p className="font-medium">{item.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
      <p className="mt-1 text-xs text-muted-foreground/80">{timeAgo(item.created_at)}</p>
    </>
  );

  const path = item.metadata?.target_path;
  const bookingId = item.metadata?.booking_id;
  const pathWithDetail =
    path && bookingId && path.startsWith("/admin/bookings")
      ? (() => {
          const [pathname, rawQuery = ""] = path.split("?", 2);
          const params = new URLSearchParams(rawQuery);
          if (!params.get("detail")) {
            params.set("detail", bookingId);
          }
          const query = params.toString();
          return query ? `${pathname}?${query}` : pathname;
        })()
      : path;
  const unread = !item.read_at;

  if (pathWithDetail) {
    return (
      <Link
        href={pathWithDetail}
        className={cn(
          "block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent",
          unread && "bg-accent/40",
        )}
        onClick={() => {
          if (unread) onMarkRead(item.id);
        }}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
        unread && "bg-accent/40",
      )}
      onClick={() => {
        if (unread) onMarkRead(item.id);
      }}
      disabled={disabled || !unread}
    >
      {inner}
    </button>
  );
}

export default function NotificationBell() {
  const PAGE_LIMIT = 15;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const realtimeOk = isSupabasePublicConfigured();
  const [open, setOpen] = useState(false);
  useNotificationRealtime(user?.id ?? null);
  const roleCaption =
    user?.role === "admin" || user?.role === "superadmin"
      ? "Ops and moderation alerts"
      : "Booking and open play updates";

  const {
    data,
    isLoading,
    isRefetching,
    isError,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } =
    useInfiniteQuery({
      queryKey: [...NOTIFICATIONS_QUERY_KEY, "paged", PAGE_LIMIT],
      queryFn: async ({ pageParam }) => {
        const { data: listResponse } = await courtlyApi.notifications.list({
          cursor: pageParam,
          limit: PAGE_LIMIT,
        });
        return listResponse;
      },
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.next_cursor ?? null,
      // Keep this active while authenticated so push realtime updates can refresh
      // the badge count immediately, even before the popover is opened.
      enabled: Boolean(user),
      staleTime: 15_000,
    });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { data: markReadResponse } = await courtlyApi.notifications.markRead(
        id,
      );
      return markReadResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_QUERY_KEY] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { data: markAllReadResponse } =
        await courtlyApi.notifications.markAllRead();
      return markAllReadResponse;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_QUERY_KEY] });
    },
  });

  if (!user) {
    return null;
  }

  const pages = data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const unread = pages[0]?.unread_count ?? 0;
  const live = pages[0]?.status === "live";
  const hasMore = pages[pages.length - 1]?.has_more ?? false;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          // Always refresh when user opens the notifications popover.
          void refetch();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Notifications</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                disabled={unread === 0 || markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
                aria-label="Mark all notifications read"
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" />
                Mark all
              </Button>
            </div>
          </div>
          {isError ? (
            <p className="mt-1 text-xs text-destructive">Could not load notifications.</p>
          ) : null}
          {live && realtimeOk ? (
            <p className="mt-1 text-xs text-muted-foreground">{roleCaption}</p>
          ) : null}
        </div>

        <div className="max-h-80 overflow-y-auto px-2 py-2">
          {isLoading || (open && isRefetching) ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul className="space-y-1" role="list">
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationRow
                    item={item}
                    onMarkRead={(id) => markRead.mutate(id)}
                    disabled={markRead.isPending}
                  />
                </li>
              ))}
            </ul>
          )}
          {!isLoading && hasMore ? (
            <div className="px-2 pb-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? "Loading..." : "Load more notifications"}
              </Button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
