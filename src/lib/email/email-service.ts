// Placeholder email service — swap in Resend, SendGrid, Nodemailer, etc. in a future phase.
// All functions are no-ops that log to console so call sites are already wired up.

export async function sendGuestBookingConfirmation(params: {
  to: string;
  playerName: string;
  bookingNumber: string;
  courtName: string;
  venueName: string;
  date: string;
  timeRange: string;
}): Promise<void> {
  console.log("[Email stub] Guest booking confirmation:", params);
}

export async function sendGuestBookingStatusUpdate(params: {
  to: string;
  playerName: string;
  bookingNumber: string;
  status: string;
  courtName: string;
  venueName: string;
}): Promise<void> {
  console.log("[Email stub] Booking status update:", params);
}

export async function sendBookingRefundInitiated(params: {
  to: string;
  playerName: string;
  bookingNumber: string;
  courtName: string;
  venueName: string;
}): Promise<void> {
  console.log("[Email stub] Booking refund initiated:", params);
}

export async function sendBookingRefunded(params: {
  to: string;
  playerName: string;
  bookingNumber: string;
  courtName: string;
  venueName: string;
}): Promise<void> {
  console.log("[Email stub] Booking refunded:", params);
}
