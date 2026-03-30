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
  async listForUser(
    userId: string,
    options?: { offset?: number; limit?: number },
  ): Promise<NotificationsListResponse> {
    void userId;
    void options;
    return PLACEHOLDER_RESPONSE;
  }

  async markRead(
    notificationId: string,
    userId: string,
  ): Promise<{ ok: true } | { ok: false }> {
    void notificationId;
    void userId;
    return { ok: true };
  }

  async markAllRead(userId: string): Promise<{ ok: true }> {
    void userId;
    return { ok: true };
  }

  async emit(input: EmitNotificationInput): Promise<void> {
    void input;
    // Placeholder only.
  }

  async emitMany(inputs: EmitNotificationInput[]): Promise<void> {
    void inputs;
    // Placeholder only.
  }
}

export class LocalPlaceholderNotificationTransport implements NotificationTransport {
  subscribe(userId: string, onEvent: () => void): NotificationSubscription {
    void userId;
    void onEvent;
    return {
      unsubscribe: () => {
        // Placeholder only.
      },
    };
  }
}
