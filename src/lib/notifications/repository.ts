import type {
  Notification,
  NotificationEventType,
  NotificationsListResponse,
} from "@/lib/notifications/types";

export type EmitNotificationInput = {
  user_id: string;
  type: NotificationEventType;
  title: string;
  body: string;
  metadata?: Notification["metadata"];
};

export interface NotificationRepository {
  listForUser(userId: string): Promise<NotificationsListResponse>;
  markRead(notificationId: string, userId: string): Promise<{ ok: true }>;
  emit(input: EmitNotificationInput): Promise<void>;
}
