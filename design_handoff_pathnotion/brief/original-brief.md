# Brief for Claude Design: Path Workspace

## The product in one sentence
A shared operating space for two co-founders of a fintech startup — CEO and CFO — that combines a product-led backlog, product and finance documentation, a unified calendar, shared tasks, and a pluggable agent into a single calm, focused environment.

## Who uses it
Two people, total. David (CEO, technical, product-led) and his Finance co-founder (CFO, document and numbers-led). Both are time-poor and taste-sensitive. This is not an enterprise tool and should not feel like one — no approvals, no role hierarchies, no compliance overhead. It should feel closer to a shared notebook that knows about their work than a SaaS dashboard. Two founders should want to open it every morning.

## What exists already
A working backlog service at **backlog.path2ai.tech** — a product-led Now / Next / Later view, with items organised by main categories (Dashboard, Boarding, SDK, MCP, and others). This is the anchor. New modules extend outward from it, and the backlog's existing logic is preserved, only restyled to match the new design system.

## Core modules

### 1. Backlog
Product-led Now / Next / Later. Items belong to a product category (Dashboard, Boarding, SDK, MCP, and others). Two views of the same data:
- **Global view** — all products side-by-side, scannable, filterable
- **Product view** — a single product's Now / Next / Later in isolation

Switching between them should feel like the same page with a lens applied, not two different screens.

### 2. Documentation
A Notion-feeling space for written notes and attached files, with both treated as first-class content. Serves two overlapping purposes:
- **Product documentation** — one doc space per product category, sitting alongside that product's backlog
- **Finance documentation** — a parallel space for the CFO's models, forecasts, legal, and contracts, organised by finance-relevant categories (not product categories)

Rich text with inline file embeds, clean writing surface, comments, and easy sharing between the two founders.

### 3. Shared calendar
A combined two-founder view powered by two-way CalDAV sync with each founder's mailbox (Fasthosts in the current case, but designed to be source-agnostic). Events created in Path sync back to the source calendar; events created in the source calendar appear in Path. Shows each founder's own events, overlapping availability, and shared events created natively. If CalDAV discovery fails for a given source, fall back gracefully to read-only `.ics` feed subscription — the UI should not change based on sync mode, only an indicator in settings.

### 4. Shared task list
Lightweight. Each task has a title, owner, due date, and reminder. Tasks can optionally link to a backlog item or a product doc for context. Not a project management system — a two-person shared to-do that either founder can drop items into and tag the other.

### 5. Agent ("Jeff")
An agent with scheduled and on-demand access across calendars, files, notes, and tasks. The interface must be general enough to support any job type, with three named v1 capabilities:
- Resolving calendar clashes and proposing reschedules
- Keeping product docs and decks in sync with backlog changes
- Drafting weekly summaries from activity across all modules

The agent UI needs to feel like a trusted collaborator — a chat-style conversation surface, a schedule showing standing jobs, a log of past runs with what was changed, and granular per-module access toggles that are easy to inspect and revoke.
