import type {
  Notification,
  NotificationCategory,
  NotificationEventType,
  NotificationsListResponse,
} from "@/lib/notifications/types";

export type EmitNotificationInput = {
  user_id: string;
  type: NotificationEventType;
  title: string;
  body: string;
  metadata?: Notification["metadata"];
  category?: NotificationCategory;
};

export interface NotificationRepository {
  listForUser(
    userId: string,
    options?: { offset?: number; limit?: number },
  ): Promise<NotificationsListResponse>;
  markRead(
    notificationId: string,
    userId: string,
  ): Promise<{ ok: true } | { ok: false }>;
  markAllRead(userId: string): Promise<{ ok: true }>;
  emit(input: EmitNotificationInput): Promise<void>;
  emitMany(inputs: EmitNotificationInput[]): Promise<void>;
}
