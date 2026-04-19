import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DATABASE_FILE
  ?? path.resolve(__dirname, '../../data/pathnotion.db');

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schemaSql = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
db.exec(schemaSql);

// Migrations — additive. Each ALTER is wrapped so re-running is a no-op.
try { db.exec('ALTER TABLE backlog_items ADD COLUMN effort_days REAL'); } catch { /* already present */ }
try { db.exec('ALTER TABLE backlog_items ADD COLUMN link_type TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE backlog_items ADD COLUMN link_ref TEXT'); } catch { /* already present */ }

export type DB = typeof db;
