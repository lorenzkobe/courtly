"use client";

import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  OpenPlayComment,
  OpenPlayDetailResponse,
  OpenPlayJoinRequest,
  OpenPlayJoinRequestStatus,
  OpenPlaySession,
} from "@/lib/types/courtly";

const MAX_RECONNECT_DELAY_MS = 30_000;

function toIso(value: unknown, fallback = new Date(0).toISOString()): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asJoinRequest(row: Record<string, unknown>): OpenPlayJoinRequest {
  return {
    id: String(row.id ?? ""),
    open_play_session_id: String(row.open_play_session_id ?? ""),
    user_id: String(row.user_id ?? ""),
    user_name: toNullableString(row.user_name),
    user_dupr_rating: typeof row.user_dupr_rating === "number" ? row.user_dupr_rating : null,
    status: String(row.status ?? "waitlisted") as OpenPlayJoinRequestStatus,
    payment_lock_expires_at: toNullableString(row.payment_lock_expires_at),
    payment_method:
      row.payment_method === "gcash" || row.payment_method === "maya"
        ? row.payment_method
        : null,
    payment_proof_url: toNullableString(row.payment_proof_url),
    payment_proof_mime_type: toNullableString(row.payment_proof_mime_type),
    payment_proof_bytes: typeof row.payment_proof_bytes === "number" ? row.payment_proof_bytes : null,
    payment_proof_width: typeof row.payment_proof_width === "number" ? row.payment_proof_width : null,
    payment_proof_height: typeof row.payment_proof_height === "number" ? row.payment_proof_height : null,
    payment_submitted_at: toNullableString(row.payment_submitted_at),
    join_note: toNullableString(row.join_note),
    organizer_note: toNullableString(row.organizer_note),
    decided_at: toNullableString(row.decided_at),
    decided_by_user_id: toNullableString(row.decided_by_user_id),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function asComment(row: Record<string, unknown>): OpenPlayComment {
  return {
    id: String(row.id ?? ""),
    open_play_session_id: String(row.open_play_session_id ?? ""),
    user_id: String(row.user_id ?? ""),
    user_name: toNullableString(row.user_name),
    comment: String(row.comment ?? ""),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    edited_at: toNullableString(row.edited_at),
  };
}

function isCountedStatus(status: OpenPlayJoinRequestStatus): status is "approved" | "pending_approval" | "payment_locked" | "waitlisted" {
  return (
    status === "approved" ||
    status === "pending_approval" ||
    status === "payment_locked" ||
    status === "waitlisted"
  );
}

function patchCounts(
  counts: OpenPlayDetailResponse["counts"],
  oldStatus: OpenPlayJoinRequestStatus | null,
  nextStatus: OpenPlayJoinRequestStatus | null,
): OpenPlayDetailResponse["counts"] {
  const next = { ...counts };
  if (oldStatus && isCountedStatus(oldStatus)) {
    next[oldStatus] = Math.max(0, next[oldStatus] - 1);
  }
  if (nextStatus && isCountedStatus(nextStatus)) {
    next[nextStatus] += 1;
  }
  return next;
}

export function useOpenPlayDetailRealtime(sessionId: string, userId: string | null) {
  const queryClient = useQueryClient();
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let disposed = false;
    const detailKey = queryKeys.openPlay.detail(sessionId);

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
      const delayMs = Math.min(1_000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (disposed) return;
        void subscribe();
      }, delayMs);
    };

    const patchJoinRequest = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      queryClient.setQueryData<OpenPlayDetailResponse | undefined>(detailKey, (current) => {
        if (!current) return current;
        if (payload.eventType === "DELETE") {
          const oldRow = payload.old ?? {};
          const oldId = String((oldRow as { id?: string }).id ?? "");
          const oldStatus = String((oldRow as { status?: string }).status ?? "") as OpenPlayJoinRequestStatus;
          const oldUserId = String((oldRow as { user_id?: string }).user_id ?? "");
          const pending = current.pending_requests?.filter((r) => r.id !== oldId) ?? [];
          return {
            ...current,
            my_request: oldUserId && userId === oldUserId ? null : current.my_request,
            pending_requests: pending,
            counts: patchCounts(current.counts, oldStatus || null, null),
          };
        }
        const row = payload.new ?? {};
        const request = asJoinRequest(row);
        const oldStatus =
          payload.eventType === "UPDATE"
            ? (String((payload.old as { status?: string } | null)?.status ?? "") as OpenPlayJoinRequestStatus)
            : null;
        const pendingStatuses: OpenPlayJoinRequestStatus[] = [
          "waitlisted",
          "payment_locked",
          "pending_approval",
        ];
        const isPending = pendingStatuses.includes(request.status);
        const nextPending = [...(current.pending_requests ?? [])];
        const idx = nextPending.findIndex((item) => item.id === request.id);
        if (isPending) {
          if (idx >= 0) nextPending[idx] = { ...nextPending[idx]!, ...request };
          else nextPending.push(request);
        } else if (idx >= 0) {
          nextPending.splice(idx, 1);
        }

        const currentMyRequest =
          userId && request.user_id === userId
            ? { ...(current.my_request ?? request), ...request }
            : current.my_request;

        return {
          ...current,
          my_request: currentMyRequest,
          pending_requests: nextPending,
          counts: patchCounts(current.counts, oldStatus, request.status),
        };
      });
    };

    const patchComment = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      queryClient.setQueryData<OpenPlayDetailResponse | undefined>(detailKey, (current) => {
        if (!current) return current;
        if (payload.eventType === "DELETE") {
          const oldId = String(((payload.old as { id?: string } | null)?.id ?? ""));
          return {
            ...current,
            comments: current.comments.filter((comment) => comment.id !== oldId),
          };
        }
        const next = asComment(payload.new ?? {});
        const comments = [...current.comments];
        const idx = comments.findIndex((comment) => comment.id === next.id);
        if (idx >= 0) comments[idx] = { ...comments[idx]!, ...next };
        else comments.push(next);
        comments.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return { ...current, comments };
      });
    };

    const patchSession = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType !== "UPDATE") return;
      queryClient.setQueryData<OpenPlayDetailResponse | undefined>(detailKey, (current) => {
        if (!current) return current;
        const row = payload.new ?? {};
        const nextSession: OpenPlaySession = {
          ...current.session,
          status: (row.status as OpenPlaySession["status"] | undefined) ?? current.session.status,
          title: (row.title as string | undefined) ?? current.session.title,
          max_players:
            typeof row.max_players === "number" ? row.max_players : current.session.max_players,
          current_players:
            typeof row.current_players === "number"
              ? row.current_players
              : current.session.current_players,
        };
        return { ...current, session: nextSession };
      });
    };

    const subscribe = async () => {
      await removeChannel();
      if (disposed) return;
      const nextChannel = supabase
        .channel(`open-play:${encodeURIComponent(sessionId)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "open_play_join_requests",
            filter: `open_play_session_id=eq.${sessionId}`,
          },
          patchJoinRequest,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "open_play_comments",
            filter: `open_play_session_id=eq.${sessionId}`,
          },
          patchComment,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "open_play_sessions",
            filter: `id=eq.${sessionId}`,
          },
          patchSession,
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
  }, [sessionId, userId, queryClient]);
}
