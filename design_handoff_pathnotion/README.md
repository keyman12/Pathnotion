# Handoff: PathNotion — Shared operating space for two founders

## Overview

PathNotion is a calm, two-person workspace for the co-founders of a fintech startup (CEO + CFO). It unifies five modules — **Week, Backlog, Documentation, Tasks, Calendar** — around a product-led Now/Next/Later backlog, and adds **Jeff**, a scheduled/on-demand agent with scoped access across calendars, docs, backlog and tasks.

The anchor product is an existing backlog service at `backlog.path2ai.tech`. The rest of the workspace extends outward from it, preserving its product-led categorisation (Dashboard, Boarding, SDK, MCP, …).

This handoff contains:

- `PathNotion.html` — the full hi-fi design prototype (single-file React, runs in any modern browser)
- `brief/original-brief.md` — the founder's product brief, for intent context
- `screenshots/*.png` — desktop captures of each view

## About the design files

The files in this bundle are **design references created in HTML** — interactive prototypes that show the intended look, layout, and behavior. They are **not production code to copy**. Your task is to recreate them in the target stack (see below) using its normal patterns.

Run `PathNotion.html` by opening it in Chrome — everything is inline (React + Babel + all styles + base64 logo). Use browser devtools' responsive mode to inspect mobile (≤768px).

## Fidelity

**High-fidelity.** Colors, typography, spacing, components, copy, and interactions are final. The "Tweaks" panel (accessible via the toolbar in the design host) exposes the knobs the user explored; the defaults embedded in the file are the chosen values.

## Target stack (as specified by the user)

- **Frontend:** React (Vite or Next.js — your call; Vite is fine for a two-person app)
- **Backend:** Node.js on EC2
- **Storage:** Postgres for relational data + S3 for file blobs (doc attachments, uploads)
- **Auth:** 2-user system. OAuth via Google/Microsoft (needed anyway for CalDAV) — no enterprise SSO, no role hierarchy. Just "David" and "Co-founder".
- **Calendar sync:** CalDAV two-way (primary) with `.ics` read-only fallback.
- **Realtime:** not required for v1. A polling refresh or simple SSE is fine. Two users means conflict is rare.

---

## Module-by-module spec

### 1. Week (landing view)

**Purpose:** the daily home. Shows _what matters this week_ at a glance without overwhelming.

**Layout (desktop):**

- Page header: title "This week" + sub-copy with today's date
- 4-up **headline tiles** grid across the top: "Focus this week", "Jeff's summary", "Shared calendar today", "Pulse" (metrics snapshot)
- Below: a two-column split
  - Left ~2/3: **Today's schedule timeline** (hour grid with both founders' events overlaid) + **Backlog focus strip** (Now items currently owned by either founder)
  - Right ~1/3: **Shared tasks due this week** + **Recent doc activity**

**Layout (mobile):** single column — swipable day picker at top, 2×2 compact tiles, then day timeline, then tasks, then a Jeff card. See `MobileWeekView` in source.

**Key interactions:**
- Clicking a backlog card jumps to Backlog in product-view mode
- Clicking a calendar event opens the event detail sheet
- Clicking Jeff's tile navigates to the Jeff conversation

### 2. Backlog

**Purpose:** product-led Now / Next / Later across every product area.

**Two lenses on the same data:**
- **Global view** — all products side-by-side. Filterable by owner, flagged, and the built-in segmented tabs (All products · Mine · Co-founder's · Flagged).
- **Product view** — a single product's Now / Next / Later in isolation. Reached by clicking a product in the sidebar or by filtering down from Global. Switching between them should feel like the same page with a lens applied, not two different screens.

**Layout options** (exposed via the Tweaks panel — pick one for v1; `Kanban` is the current default):
- **Kanban** — products × stages 2D grid
- **Lanes** — 3 stage columns (Now / Next / Later), product shown as badge on each card
- **List** — flat consolidated list, stage + product as metadata. Good for keyboard-heavy editing.

**Card shape:**
- Title (1-2 lines)
- Product tag (colored dot + label)
- Owner avatar
- Optional: linked-doc chip, estimate chip
- Hover/focus reveals drag handle + quick actions

**Copy preservation:** the item data model, stage labels (Now/Next/Later), and product categories (Dashboard, Boarding, SDK, MCP, and others) must match the existing `backlog.path2ai.tech` service. Restyle only — don't rename.

### 3. Documentation

**Purpose:** a Notion-feeling space for written notes and attached files. Two overlapping roots:
- **Product docs** — one space per product category, shown alongside that product's backlog
- **Finance docs** — a parallel root for the CFO's models, forecasts, legal, contracts. Organised by finance-specific categories (not product categories).

**Doc reader layout:**
- Left: collapsible **tree nav** (scopes: workspace / per-product / finance)
- Right: **reader column** with max-width prose (~720px), rendered from structured JSON blocks

**Block types to implement:**
- Heading (h1/h2/h3)
- Paragraph (rich text: bold, italic, inline code, links)
- Bulleted / numbered list
- Quote
- Code block
- Divider
- **File embed** (PDF, image, spreadsheet, deck) — inline card with filename, size, open-in-new-tab
- **Callout** (info/warn tint)
- **IA table** (simple columns/rows)

**Attachments:** S3-backed. Files and pages are both first-class, meaning a finance doc can just _be_ a PDF with a title and comments — you don't need to embed it in a rich-text shell.

**Commenting:** thread-style margin comments anchored to a block. Simple — no mentions, no reactions in v1.

### 4. Tasks

**Lightweight.** Not a project manager.

**Task fields:** title, owner (D or CFO), due date, reminder, optional link to a backlog item OR a doc (not both).

**Views:**
- List grouped by due-date bucket (Today, Tomorrow, This week, Later, Someday)
- Filter chips: Mine / Theirs / All

**No status.** A task is either open or completed (strikethrough + moved to an "Done" collapsed group).

### 5. Calendar

**Purpose:** shared two-founder calendar view, two-way CalDAV sync.

**Sync model:**
- Each founder connects their mailbox source (Fasthosts in the user's case, but make the adapter generic — the sync layer should discover CalDAV endpoints from an email address)
- Events created in PathNotion sync back to whichever founder's source calendar they're assigned to
- Events in the source calendar appear in PathNotion
- **Fallback:** if CalDAV discovery fails, subscribe to a read-only `.ics` feed. The UI does not change — only a small indicator in Settings shows "read-only".

**View:** week and day only in v1. Month view is out of scope.

**Rendering:** each founder gets a color. Overlapping events show overlap striping. Events with both founders owned natively show both colors.

### 6. Jeff (agent)

**Purpose:** scheduled + on-demand assistant with scoped access to calendars, docs, backlog, tasks.

**Four tabs:**
1. **Conversation** — chat-style surface with Jeff. Supports inline "accept" / "show both calendars" action chips inside agent messages when a job proposes a change.
2. **Schedule** — cron-like list of standing jobs, toggleable on/off, editable.
3. **Run log** — chronological list of past runs with timestamp, job name, summary, diff of what changed.
4. **Access** — per-module toggles. User can see exactly what Jeff touched last run and revoke individual scopes. Must feel trustworthy — a single "revoke all" control at the top.

**Three named v1 capabilities:**
- **Calendar clash resolver** — reads both founders' calendars, proposes reschedules, posts to chat. No automatic writes — always proposes.
- **Doc sync** — when a backlog item changes stage or description, edit linked docs/decks. User approves the diff.
- **Weekly summary** — runs Mondays 07:00, drafts a summary across all modules, lands as a doc in `Workspace / Weekly summaries`.

**Agent UI primitives:**
- Chat bubble (user / agent, different tints)
- Action chip row (inline in agent bubble)
- Status pill (Idle / Working / Blocked on approval / Error)
- Capability card (name, description, toggle)
- Run log row (time, title, duration, "changed N things" badge)

---

## Design system

### Colors (exact values, lifted from the prototype)

**Mode: dark (default) + light available via the Tweaks panel. The CSS uses tokens — both modes are wired.**

Dark mode tokens (the one reviewed):
```
--bg-canvas        #0f0f11   — app background
--bg-surface       #16171a   — cards, sidebar, top bar
--bg-sunken        #101114   — pressed / secondary surfaces
--border-subtle    #1f2024   — hairlines between surfaces
--border-default   #2a2b30   — inputs, card borders
--fg-1             #e8e9eb   — primary text
--fg-2             #b5b6ba   — secondary text
--fg-3             #7a7b80   — tertiary / meta
--fg-4             #4d4e52   — disabled / subtle

--path-primary        #35d37a  — accent green (path brand)
--path-primary-tint   rgba(53,211,122,0.14)
--path-primary-hover  #2bbf6c

--success-dot      #35d37a
--warn-dot         #f0a000
--danger-dot       #e5484d
```

Exact values are in the `<style>` block at the top of `PathNotion.html` under `:root` and `[data-theme="light"]`. Prefer lifting from there rather than re-deriving.

### Typography

- **Primary (UI, body):** Inter — 400 / 500 / 600
- **Secondary (headings, display):** "Fraunces" used sparingly for h1 page titles — optional, replace with a tighter display sans if your designer prefers (Söhne, GT America, Tiempos would all fit)
- **Mono:** JetBrains Mono — used for counts, timestamps, small meta labels

**Scale in use:**
```
H1 page title   24px / 600 / -0.01em
H2              18px / 600
H3              15px / 600
Body            13.5px / 400 / 1.55
Meta / label    11px / uppercase / 0.08em tracking (mono)
Small           12.5px
```

### Spacing

- 4px base grid. Common gaps: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48
- Card padding: 14–16px
- Page padding (desktop): 32px horizontal, 24px top
- Page padding (mobile): 16px horizontal, 12px top, 96px bottom (to clear tab bar)

### Radius & shadow

- Card / panel: **8px** radius
- Button / chip: **6px** radius
- Inputs: **6px** radius
- Drawer / bottom sheet: **18px** top radius
- Shadows: almost none. Use 1px borders (`--border-subtle`) as the primary separator. Elevated overlays use `0 10px 32px rgba(0,0,0,0.35)`.

### Components used

Rebuild these as reusable components in your React codebase:
- `Sidebar` (desktop) — tree nav with workspace / products / finance / agent sections
- `TopBar` — global search ⌘K, date, presence dots
- `BottomTabs` (mobile) — 5-tab bar (Week · Backlog · Docs · Jeff · More)
- `MobileTopbar` + `MobileMenu` drawer
- `SearchSheet` (mobile) — bottom-sheet search
- `PageHeader` — title + sub + tabs + action cluster, stacks on mobile
- `Card` — base surface with border + padding
- `Button` (primary / ghost / danger variants; 3 sizes)
- `Badge` / `Chip` (colored dot + label)
- `Avatar` (D / F / J for David / Finance / Jeff; also supports image)
- `Tabs` (underline, not pill)
- `TreeNav` (indented collapsibles)
- `KanbanCard` / `KanbanColumn`
- `Tile` (headline metric/summary)
- `ChatBubble` + `ActionChipRow`
- `RunLogRow`
- `BottomSheet` (mobile)

---

## Interactions & behavior

### Global
- Route persisted in `localStorage` under `path:route`. Restore on load. Use your router's history instead when you wire real routing (React Router / TanStack Router).
- ⌘K opens global search — fuzzy across docs + backlog + tasks
- Dark mode is default. Light mode exists but the user preferred dark.
- Mobile breakpoint: **≤768px** — the entire layer swaps (sidebar → bottom tabs, topbar → compact, week view → mobile-bespoke week view).

### Screen-by-screen
- **Week:** clicking tiles navigates; backlog focus strip is horizontally scrollable on narrow layouts.
- **Backlog:** drag cards between stages. On drop, POST to the existing backlog service. Optimistic update + rollback on failure.
- **Docs:** tree collapse state persists per user. Block-level "/" slash command optional in v1 — start with a top toolbar.
- **Tasks:** inline add at the top of each group. Enter creates, Esc cancels.
- **Calendar:** click a slot to create. Drag to move. Resize handles on bottom edge.
- **Jeff:** chat is non-streaming in the mockup; the real build should stream token-by-token via SSE.

### Micro-animations
- Route transitions: 180ms fade + 6px slide (see `.screen-enter` class in source)
- Drawer / sheet: 220ms cubic-bezier(.2,.8,.2,1)
- Hover on cards: 120ms background change, no transform
- Avoid bouncy springs. The app is calm.

---

## State management

Recommended shape (React + your state tool of choice; Zustand or React Query handles this well):

```
/auth        { user, otherFounder, session }
/route       { current, params }
/backlog     { items[], productCategories[], filters, byId, loading }
/docs        { tree, currentDocId, blocksById, commentsByBlockId }
/tasks       { items[], filter }
/calendar    { events[], sources[], syncStatus }
/agent       { conversations[], schedule[], runLog[], access }
/ui          { sidebarCollapsed, theme, tweaks }
```

Server state (backlog, docs, tasks, calendar, agent runs) → React Query with a short staleTime (30s for backlog, 10s for calendar). Local UI state (drawer open, filters) → Zustand or `useState`.

---

## API shape (suggested)

```
GET    /api/backlog/items?product=&stage=&owner=
POST   /api/backlog/items
PATCH  /api/backlog/items/:id          // reorder, stage change, edit
DELETE /api/backlog/items/:id

GET    /api/docs/tree?root=product|finance
GET    /api/docs/:id
PATCH  /api/docs/:id                   // block-level patch
POST   /api/docs/:id/attachments       // multipart -> S3

GET    /api/tasks
POST   /api/tasks
PATCH  /api/tasks/:id
DELETE /api/tasks/:id

GET    /api/calendar/events?from=&to=
POST   /api/calendar/events
PATCH  /api/calendar/events/:id
DELETE /api/calendar/events/:id
POST   /api/calendar/sources           // connect mailbox
POST   /api/calendar/sync              // manual re-sync

GET    /api/agent/conversations
POST   /api/agent/message              // SSE streaming response
GET    /api/agent/schedule
PATCH  /api/agent/schedule/:jobId
GET    /api/agent/runs
GET    /api/agent/access
PATCH  /api/agent/access               // revoke/grant scope
```

---

## Storage

- **Postgres** for everything relational (users, backlog items, tasks, calendar events, doc metadata, doc blocks, comments, agent jobs, run log, access grants).
- **S3** for file blobs (doc attachments, exported deliverables). Reference from Postgres by key, not URL — generate presigned URLs on demand.
- **Local JSON seed** fine for dev — a `seed.sql` + a handful of fixture docs/files should cover both founders.

---

## Assets

All assets in the prototype are embedded as base64 data URIs inside `PathNotion.html`:
- Path logo (light + dark) — extracted and exposed as `window.__PATH_LOGOS`. In your codebase, drop these as `/public/logo-light.png` and `/public/logo-dark.png` and replace.
- Icons — custom inline SVG from the prototype's `Icon` component. Use a maintained library (lucide-react is the closest match to the style).
- Avatars — letter-only placeholders. In production, let users upload images to S3.

---

## Files

- `PathNotion.html` — the complete prototype. Single source of truth for anything ambiguous in this README.
- `brief/original-brief.md` — the founder's product brief.
- `screenshots/desktop-light-01-week.png` through `-06-jeff.png` — desktop light mode, all 6 views
- `screenshots/desktop-dark-01-week.png` through `-06-jeff.png` — desktop dark mode, all 6 views
- `screenshots/mobile-light-01-week.png` through `-06-jeff.png` — mobile (390px) light mode
- `screenshots/mobile-dark-01-week.png` through `-06-jeff.png` — mobile (390px) dark mode

**Both themes and both viewports are fully implemented in the HTML source.** The screenshots show exactly what renders. For mobile, open `PathNotion.html` in Chrome DevTools' device toolbar at iPhone 14 / 390×844 to interact with the mobile layer live.

---

## Build order (recommended)

1. Scaffold React + Node backend + Postgres + S3 adapter. Seed two users.
2. **Backlog first** — it's the anchor and the existing `backlog.path2ai.tech` API is already shaped. Restyle only.
3. **Week view** — consumes backlog + calendar + tasks. Good integration test.
4. **Docs** — richest surface, biggest backend. Start with blocks-as-JSON, add attachments.
5. **Tasks** — smallest. Quick win.
6. **Calendar + CalDAV sync** — the trickiest integration. Build the adapter interface first; ship `.ics` fallback before CalDAV-write.
7. **Jeff** — last. Scaffold UI with mock responses, then wire to whichever agent runtime you settle on.
8. **Mobile layer** — bake in from day one (React + CSS media queries, same codebase). Don't ship desktop-only and retrofit.

---

## Questions for the user before starting

- Which agent runtime for Jeff? (Claude API direct, LangGraph, Inngest, something else?)
- Exact mailbox provider for each founder — confirms which CalDAV endpoints to probe.
- Any existing identity provider, or is Google OAuth fine?
- Does the existing `backlog.path2ai.tech` backend stay as-is (and we proxy/embed), or do you want it re-hosted as part of this new app?
