import { randomBytes } from "node:crypto";

const BOOKING_NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const BOOKING_NUMBER_PREFIX = "CTLY";

function yyMmDdFromDate(dateLike?: string | Date | null): string {
  let date: Date;
  if (typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
    date = new Date(`${dateLike}T00:00:00.000Z`);
  } else if (dateLike instanceof Date) {
    date = dateLike;
  } else {
    date = new Date();
  }
  const y = String(date.getUTCFullYear()).slice(-2);
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function randomBookingSuffix(length = 6): string {
  let out = "";
  const alphabetLen = BOOKING_NUMBER_ALPHABET.length;
  while (out.length < length) {
    const bytes = randomBytes(length);
    for (const byte of bytes) {
      if (out.length >= length) break;
      out += BOOKING_NUMBER_ALPHABET[byte % alphabetLen];
    }
  }
  return out;
}

export function generateBookingNumber(dateLike?: string | Date | null): string {
  return `${BOOKING_NUMBER_PREFIX}-${yyMmDdFromDate(dateLike)}-${randomBookingSuffix(6)}`;
}
