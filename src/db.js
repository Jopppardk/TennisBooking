import { hashPin } from './security.js';
import { localNow } from './dates.js';

// Keys that can be edited under Administration > Indstillinger (defaults are inserted by the migration).
export const SETTING_KEYS = [
  'club_name', 'club_email', 'club_phone', 'sms_sender', 'booking_days_ahead', 'front_text', 'missing_login_text',
];

export const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
export const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
export const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();

export async function getSettings(db) {
  const rows = await all(db, 'SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function logEvent(c, event, member = c.get('member')) {
  const user = member ? `${member.member_no} - ${member.name}` : '';
  await run(c.get('db'), 'INSERT INTO log (at, user, event, ip) VALUES (?, ?, ?, ?)', localNow(), user, event, c.get('ip'));
}

// A database without any administrator gets one when the ADMIN_PIN secret is set: member ADMIN_MEMBER_NO (default 1),
// if that number is free. Without ADMIN_PIN nobody is created; use the "Opret administrator" workflow instead.
let adminChecked = false;
export async function ensureAdmin(db, env) {
  if (adminChecked) return;
  const n = await first(db, 'SELECT COUNT(*) AS n FROM members WHERE is_admin = 1');
  if (n.n === 0 && env.ADMIN_PIN) {
    await run(
      db,
      `INSERT OR IGNORE INTO members (member_no, pin_hash, name, is_admin, max_bookings) VALUES (?, ?, 'Administrator', 1, 999)`,
      parseInt(env.ADMIN_MEMBER_NO, 10) || 1,
      await hashPin(env.ADMIN_PIN)
    );
  }
  adminChecked = true;
}
export function resetAdminCheck() {
  adminChecked = false;
}
