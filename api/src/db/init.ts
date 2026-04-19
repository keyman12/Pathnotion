import 'dotenv/config';
import bcrypt from 'bcrypt';
import { db } from './client.js';

// Bootstrap: create an admin user if none exist.
const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
if (existing.n === 0) {
  const username = process.env.ADMIN_USERNAME ?? 'dave';
  const password = process.env.ADMIN_PASSWORD ?? 'change-me';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (key, username, display_name, email, password_hash, role, color)
    VALUES (?, ?, ?, ?, ?, 'admin', ?)
  `).run('D', username, 'Dave', process.env.FOUNDER_D_EMAIL ?? null, hash, '#297D2D');
  console.log(`✓ Created admin user "${username}" (password: "${password}" — change it)`);
} else {
  console.log(`✓ ${existing.n} user(s) already present — skipping admin bootstrap`);
}

console.log(`✓ DB ready at ${db.name}`);
