import type {
  NotificationRepository,
  EmitNotificationInput,
} from "@/lib/notifications/repository";
import type {
  NotificationTransport,
  NotificationSubscription,
} from "@/lib/notifications/transport";
import type { NotificationsListResponse } from "@/lib/notifications/types";

/**
 * Placeholder adapter for future Supabase integration.
 * Implement this when the project adds Supabase client + notifications table.
 */
export class SupabaseNotificationRepository implements NotificationRepository {
  async listForUser(_userId: string): Promise<NotificationsListResponse> {
    return { items: [], unread_count: 0, status: "placeholder" };
  }

  async markRead(_notificationId: string, _userId: string): Promise<{ ok: true }> {
    return { ok: true };
  }

  async emit(_input: EmitNotificationInput): Promise<void> {
    // TODO(supabase): insert notification row through trusted server path.
  }
}

export class SupabaseNotificationTransport implements NotificationTransport {
  subscribe(_userId: string, _onEvent: () => void): NotificationSubscription {
    // TODO(supabase): use channel postgres_changes filtered by user_id.
    return { unsubscribe: () => {} };
  }
}
