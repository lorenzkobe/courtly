"use client";

import type { RealtimePostgresChangesPayload, RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { NOTIFICATIONS_QUERY_KEY } from "@/lib/notifications/query-key";
import type { Notification, NotificationsListResponse } from "@/lib/notifications/types";

const MAX_ITEMS_IN_FIRST_PAGE = 15;
const MAX_RECONNECT_DELAY_MS = 30_000;

type NotificationRow = Notification & { metadata?: Record<string, unknown> | null };

function asNotification(row: unknown): Notification {
  const data = row as Partial<NotificationRow> | null | undefined;
  return {
    id: String(data?.id ?? ""),
    user_id: String(data?.user_id ?? ""),
    category: (data?.category ?? "platform") as Notification["category"],
    type: (data?.type ?? "booking_changed") as Notification["type"],
    title: String(data?.title ?? ""),
    body: String(data?.body ?? ""),
    metadata: (data?.metadata as Notification["metadata"] | undefined) ?? undefined,
    read_at: typeof data?.read_at === "string" || data?.read_at === null ? data.read_at : null,
    created_at:
      typeof data?.created_at === "string" && data.created_at.length > 0
        ? data.created_at
        : new Date(0).toISOString(),
  };
}

function patchNotificationPages(
  current: InfiniteData<NotificationsListResponse, string | null> | undefined,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): InfiniteData<NotificationsListResponse, string | null> | undefined {
  if (!current || current.pages.length === 0) return current;
  const nextPages = current.pages.map((page) => ({
    ...page,
    items: [...page.items],
  }));
  const firstPage = nextPages[0]!;
  if (payload.eventType === "INSERT") {
    const inserted = asNotification(payload.new);
    const exists = nextPages.some((page) => page.items.some((item) => item.id === inserted.id));
    if (!exists) {
      firstPage.items = [inserted, ...firstPage.items].slice(0, MAX_ITEMS_IN_FIRST_PAGE);
      if (!inserted.read_at) {
        firstPage.unread_count += 1;
      }
    }
  }
  if (payload.eventType === "UPDATE") {
    const updated = asNotification(payload.new);
    for (const page of nextPages) {
      const idx = page.items.findIndex((item) => item.id === updated.id);
      if (idx >= 0) {
        const prev = page.items[idx]!;
        page.items[idx] = updated;
        if (!prev.read_at && updated.read_at) firstPage.unread_count = Math.max(0, firstPage.unread_count - 1);
        if (prev.read_at && !updated.read_at) firstPage.unread_count += 1;
      }
    }
  }
  if (payload.eventType === "DELETE") {
    const removedId = String((payload.old as { id?: string } | null)?.id ?? "");
    if (!removedId) return current;
    for (const page of nextPages) {
      const existing = page.items.find((item) => item.id === removedId);
      if (existing && !existing.read_at) {
        firstPage.unread_count = Math.max(0, firstPage.unread_count - 1);
      }
      page.items = page.items.filter((item) => item.id !== removedId);
    }
  }
  return { ...current, pages: nextPages };
}

/** Subscribes to `notifications` changes and applies push cache updates. */
export function useNotificationRealtime(userId: string | null) {
  const queryClient = useQueryClient();
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let disposed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const removeChannel = async () => {
      if (!channelRef.current) return;
      const active = channelRef.current;
      channelRef.current = null;
      await supabase.removeChannel(active);
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimerRef.current) return;
      const attempt = reconnectAttemptRef.current + 1;
      reconnectAttemptRef.current = attempt;
      const delay = Math.min(1_000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (disposed) return;
        void subscribe();
      }, delay);
    };

    const handlePayload = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      queryClient.setQueriesData<InfiniteData<NotificationsListResponse, string | null>>(
        { queryKey: [...NOTIFICATIONS_QUERY_KEY] },
        (current) => patchNotificationPages(current, payload),
      );
    };

    const subscribe = async () => {
      await removeChannel();
      if (disposed) return;
      const nextChannel = supabase
        .channel(`notifications:${encodeURIComponent(userId)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          handlePayload,
        )
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            reconnectAttemptRef.current = 0;
            clearReconnectTimer();
            // Pull once after subscription (or resubscription) to reconcile any missed events.
            void queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_QUERY_KEY] });
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            scheduleReconnect();
          }
        });
      channelRef.current = nextChannel;
    };

    void subscribe();

    return () => {
      disposed = true;
      clearReconnectTimer();
      void removeChannel();
    };
  }, [userId, queryClient]);
}
