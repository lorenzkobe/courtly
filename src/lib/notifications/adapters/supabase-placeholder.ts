import type {
  NotificationRepository,
  EmitNotificationInput,
} from "@/lib/notifications/repository";
import type {
  NotificationTransport,
  NotificationSubscription,
} from "@/lib/notifications/transport";
import type {
  NotificationCategory,
  NotificationEventType,
  NotificationsListResponse,
} from "@/lib/notifications/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const KNOWN_CATEGORIES: readonly NotificationCategory[] = [
  "booking",
  "review",
  "moderation",
  "court",
  "platform",
  "tournament",
  "open_play",
];

function parseNotificationCategory(value: unknown): NotificationCategory {
  return typeof value === "string" &&
    (KNOWN_CATEGORIES as readonly string[]).includes(value)
    ? (value as NotificationCategory)
    : "platform";
}

function categoryForEmit(input: EmitNotificationInput): NotificationCategory {
  if (input.category) return input.category;
  const t = input.type;
  if (
    t === "booking_cancelled" ||
    t === "booking_changed" ||
    t === "booking_completed_review_reminder" ||
    t === "booking_created_admin"
  ) {
    return "booking";
  }
  if (t === "review_added_admin") return "review";
  if (
    t === "review_flagged_author" ||
    t === "review_flagged_superadmin" ||
    t === "review_flag_resolution_feedback"
  ) {
    return "moderation";
  }
  if (t === "court_created_superadmin") return "court";
  return "platform";
}

type NotificationRow = {
  id: string;
  user_id: string;
  category: string;
  type: NotificationEventType;
  title: string;
  body: string;
  metadata: unknown;
  read_at: string | null;
  created_at: string;
};

function rowToNotification(row: NotificationRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    category: parseNotificationCategory(row.category),
    type: row.type,
    title: row.title,
    body: row.body,
    metadata: (row.metadata as EmitNotificationInput["metadata"]) ?? undefined,
    read_at: row.read_at,
    created_at: row.created_at,
  };
}

export class SupabaseNotificationRepository implements NotificationRepository {
  async listForUser(userId: string): Promise<NotificationsListResponse> {
    const supabase = await createSupabaseServerClient();
    const [listResult, countResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null),
    ]);

    if (listResult.error) throw listResult.error;
    if (countResult.error) throw countResult.error;

    const items = (listResult.data ?? []).map((row) =>
      rowToNotification(row as NotificationRow),
    );
    return {
      items,
      unread_count: countResult.count ?? 0,
      status: "live",
    };
  }

  async markRead(
    notificationId: string,
    userId: string,
  ): Promise<{ ok: true } | { ok: false }> {
    const supabase = await createSupabaseServerClient();
    const readAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return data ? { ok: true } : { ok: false };
  }

  async markAllRead(userId: string): Promise<{ ok: true }> {
    const supabase = await createSupabaseServerClient();
    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  }

  async emit(input: EmitNotificationInput): Promise<void> {
    await this.emitMany([input]);
  }

  async emitMany(inputs: EmitNotificationInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const supabase = createSupabaseAdminClient();
    const rows = inputs.map((input) => ({
      user_id: input.user_id,
      category: categoryForEmit(input),
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? null,
    }));
    // Repository remains schema-untyped until generated DB types are wired; cast keeps inserts compile-safe.
    const { error } = await supabase
      .from("notifications")
      .insert(rows as never);
    if (error) throw error;
  }
}

export class SupabaseNotificationTransport implements NotificationTransport {
  subscribe(userId: string, onEvent: () => void): NotificationSubscription {
    void userId;
    void onEvent;
    return { unsubscribe: () => {} };
  }
}
