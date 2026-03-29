"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { NOTIFICATIONS_QUERY_KEY } from "@/lib/notifications/query-key";

const DEBOUNCE_MS = 250;

export function useNotificationRealtime(userId: string | null) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const scheduleInvalidate = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // Refetch active views immediately, then mark cache stale for any inactive view.
        void queryClient.refetchQueries({ queryKey: [...NOTIFICATIONS_QUERY_KEY], type: "active" });
        void queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_QUERY_KEY] });
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
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
