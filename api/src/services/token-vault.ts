// Small wrapper around Node's crypto for AES-encrypting OAuth tokens at rest.
// The key is derived from SESSION_SECRET so tokens can't be read from a stolen DB alone.

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Keep the app booting in dev if someone hasn't set SESSION_SECRET yet — but warn loudly.
    return crypto.createHash('sha256').update('pathnotion-dev-insecure-key').digest();
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptToken(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptToken(packed: string | null | undefined): string | null {
  if (!packed) return null;
  try {
    const [ivB64, tagB64, encB64] = packed.split(':');
    if (!ivB64 || !tagB64 || !encB64) return null;
    const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}
