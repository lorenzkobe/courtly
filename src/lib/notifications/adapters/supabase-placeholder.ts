import type {
  NotificationRepository,
  EmitNotificationInput,
} from "@/lib/notifications/repository";
import type {
  NotificationTransport,
  NotificationSubscription,
} from "@/lib/notifications/transport";
import type { NotificationsListResponse } from "@/lib/notifications/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Placeholder adapter for future Supabase integration.
 * Implement this when the project adds Supabase client + notifications table.
 */
export class SupabaseNotificationRepository implements NotificationRepository {
  async listForUser(userId: string): Promise<NotificationsListResponse> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    const items =
      data?.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        category: row.category,
        type: row.type,
        title: row.title,
        body: row.body,
        metadata: row.metadata ?? undefined,
        read_at: row.read_at,
        created_at: row.created_at,
      })) ?? [];
    return {
      items,
      unread_count: items.filter((item) => !item.read_at).length,
      status: "placeholder",
    };
  }

  async markRead(notificationId: string, userId: string): Promise<{ ok: true }> {
    const supabase = await createSupabaseServerClient();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", userId);
    return { ok: true };
  }

  async emit(input: EmitNotificationInput): Promise<void> {
    const supabase = await createSupabaseServerClient();
    await supabase.from("notifications").insert({
      user_id: input.user_id,
      category: "platform",
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? null,
    });
  }
}

export class SupabaseNotificationTransport implements NotificationTransport {
  subscribe(_userId: string, _onEvent: () => void): NotificationSubscription {
    // TODO(supabase): use channel postgres_changes filtered by user_id.
    return { unsubscribe: () => {} };
  }
}
