/** Authors may edit their own open play comments within this window after `created_at`. */
export const OPEN_PLAY_COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

export function isOpenPlayCommentWithinEditWindow(
  createdAtIso: string,
  nowMs: number,
): boolean {
  const createdMs = Date.parse(createdAtIso);
  if (!Number.isFinite(createdMs)) return false;
  return nowMs - createdMs <= OPEN_PLAY_COMMENT_EDIT_WINDOW_MS;
}
