/** Philippine Peso — app-wide money formatting. */
const LOCALE = "en-PH";
const CURRENCY = "PHP";

/** Standard amounts (bookings, revenue) — always 2 decimal places. */
export function formatPhp(amount: number) {
  return amount.toLocaleString(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Hourly rates and whole-peso UI — omits “.00” when the value is a whole number. */
export function formatPhpCompact(amount: number) {
  return amount.toLocaleString(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
