"use client";

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 200;

type UseBookingsRealtimeArgs = {
  playerEmail?: string | null;
  filter?: string | null;
  enabled?: boolean;
  queryKeysToInvalidate: QueryKey[];
};

export function useBookingsRealtime({
  playerEmail,
  filter,
  enabled = true,
  queryKeysToInvalidate,
}: UseBookingsRealtimeArgs) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const scheduleInvalidate = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        for (const queryKey of queryKeysToInvalidate) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }, DEBOUNCE_MS);
    };

    const resolvedFilter =
      filter && filter.trim()
        ? filter.trim()
        : undefined;
    const emailFilter =
      playerEmail && playerEmail.trim()
        ? `player_email=eq.${playerEmail.trim()}`
        : undefined;
    const channelFilter = resolvedFilter ?? emailFilter;
    const channelName = `bookings:${encodeURIComponent(channelFilter ?? "all")}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          ...(channelFilter ? { filter: channelFilter } : {}),
        },
        scheduleInvalidate,
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [enabled, filter, playerEmail, queryClient, queryKeysToInvalidate]);
}
