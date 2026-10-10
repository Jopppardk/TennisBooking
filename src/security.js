// Runs on Cloudflare Workers and Node 20+ (WebCrypto only).
const enc = new TextEncoder();
const ITERATIONS = 20000;

const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

async function derive(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(await derive(pin, salt, ITERATIONS))}`;
}

export async function verifyPin(pin, stored) {
  const [scheme, iter, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'pbkdf2' || !hashHex) return false;
  const actual = toHex(await derive(pin, fromHex(saltHex), Number(iter)));
  return safeEqual(actual, hashHex);
}

export function safeEqual(a, b) {
  a = String(a);
  b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function randomPin(length = 4) {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => n % 10).join('');
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isValidPin(pin) {
  return /^\d{4,8}$/.test(String(pin));
}

// Throttle backed by the database, because Workers keep no memory between requests.
export function throttle(db, key, { max, windowMs }) {
  const now = Date.now();
  return {
    async blocked() {
      const row = await db.prepare('SELECT first, count FROM throttle WHERE key = ?').bind(key).first();
      return !!row && now - row.first < windowMs && row.count >= max;
    },
    async fail() {
      await db
        .prepare(
          `INSERT INTO throttle (key, first, count) VALUES (?, ?, 1)
           ON CONFLICT(key) DO UPDATE SET
             count = CASE WHEN ? - first > ? THEN 1 ELSE count + 1 END,
             first = CASE WHEN ? - first > ? THEN ? ELSE first END`
        )
        .bind(key, now, now, windowMs, now, windowMs, now)
        .run();
    },
    async reset() {
      await db.prepare('DELETE FROM throttle WHERE key = ?').bind(key).run();
    },
  };
}
