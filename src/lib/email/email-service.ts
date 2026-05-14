import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.RESEND_FROM_EMAIL ?? "Courtly <onboarding@resend.dev>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
          <!-- header -->
          <tr>
            <td style="background:#18181b;padding:24px 32px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Courtly</span>
            </td>
          </tr>
          <!-- body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                You're receiving this because you made a booking at a Courtly venue.
                Questions? Reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181b;">${text}</h1>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${text}</p>`;
}

function detail(label: string, value: string): string {
  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;font-size:13px;color:#71717a;width:130px;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;font-size:14px;color:#18181b;font-weight:500;">${value}</td>
  </tr>`;
}

function detailTable(rows: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">${rows}</table>`;
}

function button(text: string, href: string): string {
  return `
  <a href="${href}" style="display:inline-block;margin:20px 0 0;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
    ${text}
  </a>`;
}

function badge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;background:${color};color:#fff;">${text}</span>`;
}

// ---------------------------------------------------------------------------
// Email functions
// ---------------------------------------------------------------------------

export async function sendGuestBookingStatusUpdate(params: {
  to: string;
  playerName: string;
  bookingNumber: string;
  status: string;
  courtName: string;
  venueName: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  slots?: Array<{ date?: string; startTime?: string; endTime?: string; courtName?: string }>;
}): Promise<void> {
  const { to, playerName, bookingNumber, status, courtName, venueName, date, startTime, endTime, slots } = params;
  const bookingUrl = `${APP_URL}/b/${bookingNumber}`;

  const statusLabels: Record<string, { label: string; color: string; message: string }> = {
    pending_confirmation: {
      label: "Pending Confirmation",
      color: "#f59e0b",
      message: "We've received your payment proof and your booking is now pending confirmation from the venue. You'll hear back soon.",
    },
    confirmed: {
      label: "Confirmed",
      color: "#22c55e",
      message: "Great news — your booking has been confirmed by the venue. See you on the court!",
    },
    cancelled: {
      label: "Cancelled",
      color: "#ef4444",
      message: "Your booking has been cancelled. If you have questions, please contact the venue directly.",
    },
    refund: {
      label: "Refund Initiated",
      color: "#8b5cf6",
      message: "A refund has been initiated for your booking. Please allow a few business days for it to process.",
    },
    refunded: {
      label: "Refunded",
      color: "#6366f1",
      message: "Your refund has been processed. The amount should reflect in your account shortly.",
    },
  };

  const info = statusLabels[status] ?? {
    label: status,
    color: "#71717a",
    message: "Your booking status has been updated.",
  };

  function formatDate(d?: string) {
    return d
      ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
      : "";
  }

  const activeSlots = slots && slots.length > 0 ? slots : null;

  let slotRows: string;
  if (activeSlots && activeSlots.length > 1) {
    slotRows = activeSlots
      .map((slot, i) => {
        const parts = [
          slot.courtName,
          formatDate(slot.date),
          slot.startTime && slot.endTime ? `${slot.startTime} – ${slot.endTime}` : "",
        ].filter(Boolean);
        return detail(`Slot ${i + 1}`, parts.join(" · "));
      })
      .join("");
  } else {
    const s = activeSlots ? activeSlots[0] : null;
    const dateLabel = formatDate(s?.date ?? date);
    const timeRange = (s?.startTime ?? startTime) && (s?.endTime ?? endTime)
      ? `${s?.startTime ?? startTime} – ${s?.endTime ?? endTime}`
      : "";
    slotRows =
      detail("Court", courtName) +
      (dateLabel ? detail("Date", dateLabel) : "") +
      (timeRange ? detail("Time", timeRange) : "");
  }

  const body = `
    ${h1("Booking Update")}
    ${p(`Hi ${playerName}, here's an update on your booking.`)}
    ${detailTable(
      detail("Booking #", bookingNumber) +
      detail("Venue", venueName) +
      slotRows +
      detail("Status", badge(info.label, info.color))
    )}
    ${p(info.message)}
    ${button("View Booking", bookingUrl)}
  `;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Booking Update — ${info.label}`,
    html: layout("Booking Update", body),
  });
}

export async function sendBookingRefundInitiated(params: {
  to: string;
  playerName: string;
  bookingNumber: string;
  courtName: string;
  venueName: string;
}): Promise<void> {
  await sendGuestBookingStatusUpdate({
    ...params,
    status: "refund",
  });
}

export async function sendBookingRefunded(params: {
  to: string;
  playerName: string;
  bookingNumber: string;
  courtName: string;
  venueName: string;
}): Promise<void> {
  await sendGuestBookingStatusUpdate({
    ...params,
    status: "refunded",
  });
}
