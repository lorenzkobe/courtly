# Booking completion job (scheduled cleanup)

## What it does

- Runs on a schedule and marks eligible `confirmed` bookings as `completed` (idempotent; each run processes anything whose end time has passed in Manila).
- Uses `Asia/Manila` time.
- Handles split/group bookings (`booking_group_id`) as one session:
  - completes only after the latest segment has ended.
- Sends review reminder notifications only when the user has not reviewed that venue yet.

## Scheduler

- Vercel Cron schedule is defined in `vercel.json` (Vercel uses **UTC**; Hobby projects allow **at most one run per day**):
  - `0 18 * * *` → once daily at 18:00 UTC (same instant as 02:00 `Asia/Manila`) → `/api/internal/jobs/bookings/complete-hourly`
- On **Pro**, you can switch back to an hourly expression (e.g. `0 * * * *`) if you want completions closer to slot end times.

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
