# Courtly

Courtly is a Next.js App Router application for court discovery, booking, open play sessions, and venue administration.

## Tech Stack

- Next.js App Router + React + TypeScript
- Tailwind CSS + shared UI primitives in `src/components/ui`
- Supabase (auth, data access, and migrations under `supabase/migrations`)

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables (copy from `.env.example` and fill values):

```bash
cp .env.example .env
```

3. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Quality Checks

```bash
npm run lint
npm run build
```

## Repo Notes

- App code lives under `src/` (including routes in `src/app`).
- Database schema history is tracked in `supabase/migrations` and should be treated as append-only.
- Operational and historical engineering notes live in `docs/`; these are intentionally retained for context unless explicitly archived.
