/** `HH:mm` ranges on the same calendar day — string compare works for overlap. */
export function timeRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA < endB && endA > startB;
}
