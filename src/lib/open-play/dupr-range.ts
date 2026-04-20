/** Round to 2 decimals for DUPR bounds (matches DB numeric(5,2)). */
export function roundDuprBound(raw: string): number {
  return Math.round(Number.parseFloat(raw.trim()) * 100) / 100;
}

export function isValidOpenPlayDuprRange(min: number, max: number): boolean {
  return (
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min >= 2 &&
    max <= 8 &&
    min <= max
  );
}
