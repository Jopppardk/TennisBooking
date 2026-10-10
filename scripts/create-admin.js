// Writes create-admin.sql, which creates (or updates) an administrator. Used by the "Opret administrator" workflow,
// which reads member number, PIN and name from the workflow inputs so the PIN never ends up in the repository:
//   node scripts/create-admin.js <member_no> <pin> [name]
// or, inside GitHub Actions, with no arguments (the inputs are read from the workflow event).
// Also removes the automatically created "Administrator" (member 1) if it was never used for bookings.
import fs from 'node:fs';
import { hashPin, isValidPin } from '../src/security.js';

let [memberNo, pin, name] = process.argv.slice(2);
if (!memberNo && process.env.GITHUB_EVENT_PATH) {
  const inputs = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).inputs || {};
  ({ member_no: memberNo, pin, name } = inputs);
  if (pin) console.log(`::add-mask::${pin}`);
}
const no = parseInt(memberNo, 10);
if (!Number.isInteger(no) || no < 1 || !isValidPin(String(pin || ''))) {
  console.error('Brug: node scripts/create-admin.js <medlemsnr> <pinkode 4-8 cifre> [navn]');
  process.exit(1);
}
const q = (x) => `'${String(x).replace(/'/g, "''")}'`;
const n = String(name || '').trim() || 'Administrator';
const hash = await hashPin(String(pin));
const bootstrap = `member_no = 1 AND name = 'Administrator' AND email = '' AND ${no} <> 1
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.member_id = members.id OR b.partner_id = members.id)`;
const sql = [
  `INSERT INTO members (member_no, pin_hash, name, is_admin, max_bookings, active, updated_by) VALUES (${no}, ${q(hash)}, ${q(n)}, 1, 999, 1, 'opret administrator')
  ON CONFLICT(member_no) DO UPDATE SET pin_hash = excluded.pin_hash, is_admin = 1, active = 1, max_bookings = 999, updated_at = datetime('now'), updated_by = excluded.updated_by;`,
  `DELETE FROM sessions WHERE member_id IN (SELECT id FROM members WHERE ${bootstrap});`,
  `DELETE FROM members WHERE ${bootstrap};`,
];
fs.writeFileSync('create-admin.sql', sql.join('\n') + '\n');
console.log(`create-admin.sql skrevet: medlem ${no} bliver administrator.`);
