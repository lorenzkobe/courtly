import type {
  NotificationRepository,
  EmitNotificationInput,
} from "@/lib/notifications/repository";
import type {
  NotificationTransport,
  NotificationSubscription,
} from "@/lib/notifications/transport";
import type { NotificationsListResponse } from "@/lib/notifications/types";

const PLACEHOLDER_RESPONSE: NotificationsListResponse = {
  items: [],
  unread_count: 0,
  status: "placeholder",
};

export class LocalPlaceholderNotificationRepository
  implements NotificationRepository
{
  async listForUser(_userId: string): Promise<NotificationsListResponse> {
    return PLACEHOLDER_RESPONSE;
  }

  async markRead(_notificationId: string, _userId: string): Promise<{ ok: true }> {
    return { ok: true };
  }

  async emit(_input: EmitNotificationInput): Promise<void> {
    // Placeholder only. Actual write/emit behavior is implemented in Supabase phase.
  }
}

export class LocalPlaceholderNotificationTransport implements NotificationTransport {
  subscribe(_userId: string, _onEvent: () => void): NotificationSubscription {
    return {
      unsubscribe: () => {
        // Placeholder only.
      },
    };
  }
}
