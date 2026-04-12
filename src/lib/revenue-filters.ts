/** Validate YYYY-MM-DD for booking.date comparisons. */
export function parseIsoDateParam(dateParam: string | null): string | null {
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return null;
  const parsedMs = Date.parse(`${dateParam}T12:00:00`);
  if (Number.isNaN(parsedMs)) return null;
  return dateParam;
}

export function normalizeDateRange(
  from: string | null,
  to: string | null,
): { from: string | null; to: string | null } {
  if (from && to && from > to) {
    return { from: to, to: from };
  }
  return { from, to };
}
