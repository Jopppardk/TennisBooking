// Turns a CSV export of the old system's "medlemmer" table into SQL for the D1 database.
// Usage:
//   npm run import-members -- medlemmer.csv            (writes import-members.sql)
//   npx wrangler d1 execute DB --remote --file import-members.sql
// Recognised columns (old Danish names or new English ones):
//   medlnr/member_no, pin, navn/name, vej/address, postnr/postcode, bynavn/city, email, tlf/phone, mob/mobile,
//   foedselsdato/birthdate, medlemstype/member_type, adm/is_admin, antbookings/max_bookings, act/active
// Separator ; or , is detected from the header. Existing member numbers are updated, new ones created.
// PINs are stored hashed, so members keep the PIN they already have. Rows without a PIN get a random one,
// listed in nye-pinkoder.csv so they can be sent out (delete that file afterwards).
import fs from 'node:fs';
import { hashPin, randomPin } from '../src/security.js';

const file = process.argv[2];
if (!file) {
  console.error('Brug: npm run import-members -- medlemmer.csv');
  process.exit(1);
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const head = text.split('\n')[0];
  const sep = (head.match(/;/g) || []).length >= (head.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const ALIASES = {
  member_no: ['medlnr', 'member_no'], pin: ['pin'], name: ['navn', 'name'], address: ['vej', 'address'],
  postcode: ['postnr', 'postcode'], city: ['bynavn', 'city'], email: ['email'], phone: ['tlf', 'phone'],
  mobile: ['mob', 'mobile'], birthdate: ['foedselsdato', 'birthdate'], member_type: ['medlemstype', 'member_type'],
  is_admin: ['adm', 'is_admin'], max_bookings: ['antbookings', 'max_bookings'], active: ['act', 'active'],
};

const [header, ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
const col = Object.fromEntries(
  Object.entries(ALIASES).map(([k, names]) => [k, header.findIndex((h) => names.includes(h.trim().toLowerCase()))])
);
if (col.member_no < 0 || col.name < 0) {
  console.error('CSV-filen skal mindst have kolonnerne medlnr og navn.');
  process.exit(1);
}

const get = (r, k) => (col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '');
const q = (x) => (typeof x === 'number' ? String(x) : `'${String(x).replace(/'/g, "''")}'`);
const sql = [];
const newPins = [];

for (const r of rows) {
  const no = parseInt(get(r, 'member_no'), 10);
  if (!no) continue;
  let pin = get(r, 'pin');
  if (!/^\d{4,8}$/.test(pin)) {
    pin = randomPin(4);
    newPins.push(`${no};${get(r, 'name')};${pin}`);
  }
  const birth = get(r, 'birthdate');
  const x = {
    member_no: no, pin_hash: await hashPin(pin), name: get(r, 'name'), address: get(r, 'address'), postcode: get(r, 'postcode'),
    city: get(r, 'city'), email: get(r, 'email'), phone: get(r, 'phone'), mobile: get(r, 'mobile'),
    birthdate: /^\d{4}-\d{1,2}-\d{1,2}$/.test(birth) && !birth.startsWith('0000')
      ? birth.split('-').map((p, i) => (i ? p.padStart(2, '0') : p)).join('-') : '',
    member_type: get(r, 'member_type'), is_admin: get(r, 'is_admin') === '1' ? 1 : 0,
    max_bookings: parseInt(get(r, 'max_bookings'), 10) || 1,
    active: col.active >= 0 && get(r, 'active') === '0' ? 0 : 1,
  };
  const cols = Object.keys(x);
  sql.push(
    `INSERT INTO members (${cols.join(', ')}) VALUES (${cols.map((k) => q(x[k])).join(', ')})\n` +
      `  ON CONFLICT(member_no) DO UPDATE SET ${cols.filter((k) => k !== 'member_no').map((k) => `${k} = excluded.${k}`).join(', ')};`
  );
}

fs.writeFileSync('import-members.sql', sql.join('\n') + '\n');
console.log(`${sql.length} medlemmer skrevet til import-members.sql.`);
console.log('Kør: npx wrangler d1 execute DB --remote --file import-members.sql   (og slet filen bagefter)');
if (newPins.length) {
  fs.writeFileSync('nye-pinkoder.csv', 'medlnr;navn;pinkode\n' + newPins.join('\n') + '\n');
  console.log(`${newPins.length} medlemmer manglede pinkode og har fået en ny. Se nye-pinkoder.csv (slet filen bagefter).`);
}
