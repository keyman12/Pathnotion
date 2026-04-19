# PathNotion — context for Claude

Two-founder workspace (Dave + Raj). Six modules: Week, Backlog, Docs, Tasks, Calendar, Jeff (agent).

## Stack

- **Frontend** (`web/`): Vite + React 18 + TypeScript, Zustand for UI state, TanStack Query for server state. Styles are CSS-in-JS inline + a small set of CSS files in `web/src/styles/` (tokens, globals, shell, modules).
- **Backend** (`api/`): Node 20 + Express + TypeScript, Drizzle ORM, Postgres. CRUD route skeletons live; auth/CalDAV/S3/agent are stubbed.
- **Workspaces**: npm workspaces — `web/` and `api/`. Top-level `npm run dev` runs both.

## Source of truth for UI

`design_handoff_pathnotion/PathNotion.html` is the canonical prototype. Before changing anything visible, **open the relevant section of that file**. Screenshots are in `design_handoff_pathnotion/screenshots/` — both light and dark, both desktop and mobile.

When the user reports the implementation is "off the design", treat the prototype as ground truth. Don't ad-lib token values, font sizes, or colours — pull them from the prototype's inline styles or from the existing tokens.

## Token rules

All colour, type, spacing, and radius values live in `web/src/styles/tokens.css`. **Use the existing tokens; do not add new ones.** If you find yourself reaching for a literal hex, look in `tokens.css` first — it's almost certainly already named there as `--fg-1`, `--bg-surface`, `--path-primary-tint`, `--danger-bg`, etc.

Dark mode is handled by a `[data-theme="dark"]` block that overrides the same token names. Components should never branch on theme — they should reference tokens that swap automatically.

## Avatars and brand colours

Dave/Raj/Jeff (`A` or `J`) avatars are themed via CSS classes `.av-dave / .av-raj / .av-agent` defined in `globals.css`. These have light and dark variants. Don't pass colours via inline styles — apply the class.

## File conventions

- One view file per route in `web/src/views/`
- Shared UI primitives in `web/src/components/primitives.tsx` — extend this file rather than duplicating styles
- Icons in `web/src/components/Icon.tsx` — inline SVG, 20×20 viewBox, stroke `currentColor`. To add an icon: add a new entry to the `paths` map.
- The "now" date is pinned to `Mon 13 Apr 2026 · 10:42 GMT` in `App.tsx` — leave it pinned until real auth + calendars exist.

## Repo state

No git repository (`.git` not initialised). Be cautious with destructive shell commands — there's no recovery. Confirm with the user before `rm -rf` on anything inside the project, or before regenerating files like `design_handoff_pathnotion/`.

## Things deliberately stubbed

Auth, CalDAV sync, S3 uploads, Jeff streaming, and the `backlog.path2ai.tech` proxy are intentionally not wired yet. See the README's "What's stubbed / pending" section.
