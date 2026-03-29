"use client";

import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { courtlyApi } from "@/lib/api/courtly-client";
import { useAuth } from "@/lib/auth/auth-context";
import { NOTIFICATIONS_QUERY_KEY } from "@/lib/notifications/query-key";
import { useNotificationRealtime } from "@/lib/notifications/use-notification-realtime";
import { isSupabasePublicConfigured } from "@/lib/supabase/env";
import type { Notification } from "@/lib/notifications/types";
import { Badge } from "@/components/ui/badge";
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
  const unread = !item.read_at;

  if (path) {
    return (
      <Link
        href={path}
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const realtimeOk = isSupabasePublicConfigured();
  useNotificationRealtime(user?.id ?? null);

  const { data, isLoading, isError } = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      const { data: payload } = await courtlyApi.notifications.list();
      return payload;
    },
    enabled: Boolean(user),
    staleTime: realtimeOk ? 5 * 60 * 1000 : 0,
    refetchInterval: realtimeOk ? false : 30_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { data: payload } = await courtlyApi.notifications.markRead(id);
      return payload;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_QUERY_KEY] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { data: payload } = await courtlyApi.notifications.markAllRead();
      return payload;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_QUERY_KEY] });
    },
  });

  if (!user) {
    return null;
  }

  const items = data?.items ?? [];
  const unread = data?.unread_count ?? 0;
  const live = data?.status === "live";

  return (
    <Popover>
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
              {live ? (
                realtimeOk ? (
                  <Badge variant="secondary" className="text-xs">
                    Live
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Refreshes ~30s
                  </Badge>
                )
              ) : null}
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
        </div>

        <div className="max-h-80 overflow-y-auto px-2 py-2">
          {isLoading ? (
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
