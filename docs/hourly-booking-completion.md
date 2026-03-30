# Hourly Booking Completion Job

## What it does

- Runs hourly and marks eligible `confirmed` bookings as `completed`.
- Uses `Asia/Manila` time.
- Handles split/group bookings (`booking_group_id`) as one session:
  - completes only after the latest segment has ended.
- Sends review reminder notifications only when the user has not reviewed that venue yet.

## Scheduler

- Vercel Cron schedule is defined in `vercel.json`:
  - `0 * * * *` -> `/api/internal/jobs/bookings/complete-hourly`

## Required environment variable

- `CRON_SECRET`: shared secret used by the internal job endpoint.

The endpoint accepts either:

- `Authorization: Bearer <CRON_SECRET>`, or
- `x-cron-secret: <CRON_SECRET>`

## Manual run (example)

```bash
curl -i "https://<your-domain>/api/internal/jobs/bookings/complete-hourly" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

## Response payload

- `seed_count`: candidate rows fetched from DB
- `candidate_entities`: eligible standalone/group entities found
- `selected_entities`: entities processed this run
- `completed_count`: bookings moved to `completed`
- `skipped_count`: rows selected but already no longer `confirmed`
- `reminders_sent`: review reminders emitted after completion checks
- `has_more`: whether additional eligible work likely remains
- `duration_ms`: total execution time
