"use client";

import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Booking, CourtBookingSurfaceResponse } from "@/lib/types/courtly";

const MAX_RECONNECT_DELAY_MS = 30_000;

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
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

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

    const expectedFromKey = (key: QueryKey): { courtId?: string; date?: string } => {
      if (!Array.isArray(key)) return {};
      const params = key.find((part) => typeof part === "object" && part !== null) as
        | Record<string, unknown>
        | undefined;
      if (!params) return {};
      return {
        courtId:
          typeof params.courtId === "string"
            ? params.courtId
            : typeof params.court_id === "string"
              ? params.court_id
              : undefined,
        date: typeof params.date === "string" ? params.date : undefined,
      };
    };

    const asBooking = (row: Record<string, unknown>): Booking => {
      return {
        id: String(row.id ?? ""),
        booking_number: (row.booking_number as string | null | undefined) ?? undefined,
        court_id: String(row.court_id ?? ""),
        booking_group_id: (row.booking_group_id as string | undefined) ?? undefined,
        date: String(row.date ?? "").slice(0, 10),
        start_time: String(row.start_time ?? ""),
        end_time: String(row.end_time ?? ""),
        player_name: (row.player_name as string | undefined) ?? undefined,
        player_email: (row.player_email as string | undefined) ?? undefined,
        user_id: (row.user_id as string | null | undefined) ?? null,
        players_count: (row.players_count as number | undefined) ?? undefined,
        court_subtotal: Number(row.court_subtotal ?? 0),
        booking_fee: Number(row.booking_fee ?? 0),
        total_cost: Number(row.total_cost ?? 0),
        status: (row.status as Booking["status"]) ?? "pending_payment",
        hold_expires_at: (row.hold_expires_at as string | null | undefined) ?? null,
        created_date:
          typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
      };
    };

    const patchList = (
      current: Booking[] | undefined,
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ): Booking[] | undefined => {
      if (!current) return current;
      if (payload.eventType === "DELETE") {
        const oldId = String(((payload.old as { id?: string } | null)?.id ?? ""));
        return current.filter((booking) => booking.id !== oldId);
      }
      const next = asBooking(payload.new ?? {});
      const idx = current.findIndex((booking) => booking.id === next.id);
      if (idx >= 0) {
        const copy = [...current];
        copy[idx] = { ...copy[idx]!, ...next };
        return copy;
      }
      return [next, ...current];
    };

    const patchSurface = (
      current: CourtBookingSurfaceResponse | undefined,
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ): CourtBookingSurfaceResponse | undefined => {
      if (!current) return current;
      const bookings = patchList(current.availability.bookings, payload);
      if (!bookings) return current;
      return {
        ...current,
        availability: {
          ...current.availability,
          bookings,
        },
      };
    };

    const handlePayload = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const newRow = payload.new ?? {};
      const oldRow = payload.old ?? {};
      const rowCourtId = String((newRow.court_id ?? oldRow.court_id ?? ""));
      const rowDate = String((newRow.date ?? oldRow.date ?? "")).slice(0, 10);
      for (const queryKey of queryKeysToInvalidate) {
        const expected = expectedFromKey(queryKey);
        if (expected.courtId && rowCourtId && expected.courtId !== rowCourtId) continue;
        if (expected.date && rowDate && expected.date !== rowDate) continue;
        if (Array.isArray(queryKey) && queryKey[0] === "booking-surface") {
          queryClient.setQueryData<CourtBookingSurfaceResponse | undefined>(
            queryKey,
            (current) => patchSurface(current, payload),
          );
          continue;
        }
        queryClient.setQueryData<Booking[] | undefined>(queryKey, (current) =>
          patchList(current, payload),
        );
      }
    };

    const resolvedFilter =
      filter && filter.trim()
        ? filter.trim()
        : undefined;
    // Values must be URL-encoded: '+' in emails (e.g. user+tag@gmail.com) breaks filters otherwise.
    const emailFilter =
      playerEmail && playerEmail.trim()
        ? `player_email=eq.${encodeURIComponent(playerEmail.trim())}`
        : undefined;
    const channelFilter = resolvedFilter ?? emailFilter;
    const channelName = `bookings:${encodeURIComponent(channelFilter ?? "all")}`;
    const subscribe = async () => {
      await removeChannel();
      if (disposed) return;
      const nextChannel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "bookings",
            ...(channelFilter ? { filter: channelFilter } : {}),
          },
          handlePayload,
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
  }, [enabled, filter, playerEmail, queryClient, queryKeysToInvalidate]);
}
