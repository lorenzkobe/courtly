import { syncOpenPlayLifecycleStatuses } from "@/lib/data/courtly-db";

export async function runSyncOpenPlayLifecycleJob(nowMs: number): Promise<{
  open_play_updated_count: number;
  duration_ms: number;
}> {
  const startedAt = Date.now();
  const { updated_count } = await syncOpenPlayLifecycleStatuses(nowMs);
  return {
    open_play_updated_count: updated_count,
    duration_ms: Date.now() - startedAt,
  };
}
