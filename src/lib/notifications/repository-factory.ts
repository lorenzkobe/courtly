import type { NotificationRepository } from "@/lib/notifications/repository";
import { LocalPlaceholderNotificationRepository } from "@/lib/notifications/adapters/local-placeholder";
import { SupabaseNotificationRepository } from "@/lib/notifications/adapters/supabase-placeholder";

export function createNotificationRepository(): NotificationRepository {
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    return new SupabaseNotificationRepository();
  }
  return new LocalPlaceholderNotificationRepository();
}
