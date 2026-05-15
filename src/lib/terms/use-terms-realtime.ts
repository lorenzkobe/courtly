"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Subscribes admin sessions to terms_versions inserts so the gate flips
 * within ~1s of a superadmin publishing a new version, even if the admin
 * tab is focused and idle on a single page.
 */
export function useTermsRealtime({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
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

    const subscribe = async () => {
      await removeChannel();
      if (disposed) return;
      const nextChannel = supabase
        .channel("terms-versions")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "terms_versions",
          },
          () => {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.terms.adminState(),
            });
          },
        )
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            reconnectAttemptRef.current = 0;
            clearReconnectTimer();
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
  }, [enabled, queryClient]);
}
