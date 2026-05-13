"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { NOTIFICATIONS_QUERY_KEY } from "@/lib/notifications/query-key";

const MAX_RECONNECT_DELAY_MS = 30_000;

/** Subscribes to a Broadcast channel for real-time notification signals.
 *  Broadcast bypasses Postgres RLS — no Supabase Auth JWT timing issues. */
export function useNotificationRealtime(userId: string | null) {
  const queryClient = useQueryClient();
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const scheduleReconcile = () => {
      if (reconcileTimerRef.current) return;
      reconcileTimerRef.current = setTimeout(() => {
        reconcileTimerRef.current = null;
        if (disposed) return;
        void queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_QUERY_KEY] });
      }, 500);
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

    const handlePayload = () => {
      scheduleReconcile();
    };

    const subscribe = async () => {
      await removeChannel();
      if (disposed) return;
      const nextChannel = supabase
        .channel(`user-notifications:${userId}`)
        .on("broadcast", { event: "notification" }, handlePayload)
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
      if (reconcileTimerRef.current) {
        clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = null;
      }
      void removeChannel();
    };
  }, [userId, queryClient]);
}
