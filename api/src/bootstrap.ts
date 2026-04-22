// Loads environment variables before any other module initialises. Because ESM import
// statements are hoisted to the top of every module, a plain `dotenv.config()` call
// sitting underneath imports in index.ts runs AFTER all downstream modules have already
// read `process.env`. That means `db/client.ts` would see an undefined `DATABASE_FILE`
// and fall back to the repo-relative default — in prod that means we write to the wrong
// DB and logins look broken because the user row lives elsewhere.
//
// Putting the dotenv call inside its own module, imported FIRST from index.ts, means it
// runs as part of the initial import graph before anything else loads.
//
// `override: true` handles sandboxes (Claude Code, some CI runners) that pre-populate
// ANTHROPIC_API_KEY as an empty string.
import dotenv from 'dotenv';
dotenv.config({ override: true });
