export type NotificationCategory =
  | "booking"
  | "review"
  | "moderation"
  | "court"
  | "platform"
  | "tournament"
  | "open_play";

export type NotificationEventType =
  | "booking_cancelled"
  | "booking_changed"
  | "booking_completed_review_reminder"
  | "booking_created_admin"
  | "review_added_admin"
  | "review_flagged_author"
  | "review_flagged_superadmin"
  | "review_flag_resolution_feedback"
  | "court_created_superadmin";

export type NotificationMetadata = {
  booking_id?: string;
  booking_group_id?: string;
  court_id?: string;
  review_id?: string;
  actor_user_id?: string;
  target_path?: string;
};

export type Notification = {
  id: string;
  user_id: string;
  category: NotificationCategory;
  type: NotificationEventType;
  title: string;
  body: string;
  metadata?: NotificationMetadata;
  read_at: string | null;
  created_at: string;
};

export type NotificationsListResponse = {
  items: Notification[];
  unread_count: number;
  status: "live" | "placeholder";
};
