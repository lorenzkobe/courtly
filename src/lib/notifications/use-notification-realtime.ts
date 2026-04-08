"use client";

import { useEffect, useRef } from "react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { NOTIFICATIONS_QUERY_KEY } from "@/lib/notifications/query-key";

const DEBOUNCE_MS = 250;

export function useNotificationRealtime(userId: string | null) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  useEffect(() => {
    if (!userId) {
      setRealtimeConnected(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setRealtimeConnected(false);
      return;
    }

    const scheduleInvalidate = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void queryClient.refetchQueries({
          queryKey: [...NOTIFICATIONS_QUERY_KEY],
          type: "active",
        });
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        scheduleInvalidate,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeConnected(false);
        }
      });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return { realtimeConnected };
}
