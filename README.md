# PathNotion

Shared operating space for two founders — Week, Backlog, Docs, Tasks, Calendar, Jeff.

## Stack

- **Frontend:** Vite + React 18 + TypeScript, Zustand for UI state, TanStack Query for server state
- **Backend:** Node 20 + Express + TypeScript, Drizzle ORM
- **DB:** Postgres (schema in `api/src/db/schema.ts`)
- **Blob:** S3 (adapter pending)
- **Agent:** Anthropic SDK (Jeff)

npm workspaces — everything is in one repo. `web/` and `api/` are the two packages.

## Run locally

```bash
# One-shot install (both workspaces)
npm install

# Frontend only (runs against seed data)
npm run dev:web             # http://localhost:5173

# Backend only (needs Postgres)
cp api/.env.example api/.env
# fill in DATABASE_URL, etc.
createdb pathnotion
npm --workspace api run db:push
npm run seed
npm run dev:api             # http://localhost:4000

# Both at once
npm run dev
```

The frontend falls back to in-memory seed data when the API isn't reachable, so you can run `dev:web` alone to look at the UI.

## Project layout

```
web/
  src/
    components/     # Shell + shared primitives (Icon, Card, Button, Avatar, …)
    views/          # One file per module (WeekView, BacklogView, …)
    styles/         # tokens.css, globals.css, shell.css, modules.css
    lib/            # store (zustand), queries (react-query), api client, seed, types
    main.tsx
    App.tsx
  public/
    logo-light.png  # Path brand logo, extracted from the design prototype
    logo-dark.png
  index.html

api/
  src/
    db/             # Drizzle schema + Postgres client + seed script
    routes/         # Express routers per module
    index.ts        # Server entry
  drizzle.config.ts
  .env.example

design_handoff_pathnotion/   # Original design handoff (HTML prototype + brief)
```

## Routing

Client routing is localStorage-driven via a single `route` key in Zustand. Routes: `week`, `backlog`, `docs`, `finance-docs`, `tasks`, `calendar`, `jeff`, and `product:{id}` for per-product backlog views. Matches the prototype's model — swap to TanStack Router or react-router when deploying.

## What's implemented

- All six views at visual fidelity (Week, Backlog, Docs, Tasks, Calendar, Jeff)
- Dark mode (default) + light mode toggle, density knobs
- Mobile layer (≤768px): bottom tab bar, sticky topbar, drawer menu, bespoke MobileWeekView
- Drag-and-drop between Kanban stages
- Jeff: 4 tabs wired (conversation, schedule, run log, access)
- Backend routes for all modules (CRUD skeletons)
- Drizzle schema covering users, products, backlog, tasks, calendar events, docs, doc blocks, attachments, agent jobs, runs, messages, access grants

## What's stubbed / pending

- **Auth** — Google/Microsoft OAuth. Two-user whitelist via env vars. Stub endpoint not yet wired.
- **CalDAV sync** — the adapter interface is expected in `api/src/services/caldav.ts`. Seed only emits local events today.
- **S3 uploads** — presigned URL endpoint stubbed at `POST /api/docs/:id/attachments`.
- **Jeff streaming** — `/api/agent/message` streams a canned response over SSE. Replace with Anthropic SDK calls once `ANTHROPIC_API_KEY` is set.
- **Backlog service proxy** — if the existing `backlog.path2ai.tech` stays live, swap `/api/backlog/*` to proxy into it.

## Open decisions (deferred)

See the questions section at the end of `design_handoff_pathnotion/README.md`:

1. Agent runtime for Jeff — assumed Anthropic SDK direct.
2. Mailbox provider per founder — CalDAV adapter kept generic.
3. Identity provider — assumed Google OAuth.
4. Whether `backlog.path2ai.tech` stays live — assumed re-host in this repo.
