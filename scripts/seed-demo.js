// Writes demo members and bookings for the current week to demo.sql, for trying the site locally:
//   npm run seed-demo && npx wrangler d1 execute DB --local --file demo.sql
// Demo members 10-17 have PIN 1111. Don't run it against the real (remote) database.
import fs from 'node:fs';
import { hashPin } from '../src/security.js';
import { today, addDays, mondayOf, isoWeek } from '../src/dates.js';

const names = ['Anna Andersen', 'Bo Berg', 'Carl Clausen', 'Dorthe Dam', 'Erik Eriksen', 'Freja Fog', 'Gustav Holm', 'Helle Iversen'];
const pin = await hashPin('1111');
const sql = [];
names.forEach((n, i) => {
  sql.push(
    `INSERT OR IGNORE INTO members (member_no, pin_hash, name, email, mobile, member_type, max_bookings) VALUES (${10 + i}, '${pin}', '${n}', '${n.split(' ')[0].toLowerCase()}@example.dk', '2000000${i}', 'Senior', 2);`
  );
});
const { year, week } = isoWeek(today());
const monday = mondayOf(year, week);
let k = 0;
for (let day = 0; day < 7; day++) {
  for (const court of [1, 2]) {
    for (const offset of [1, 4, 9, 11]) {
      if ((day + offset + court) % 3 === 0) continue;
      const a = 10 + (k % 8), b = 10 + ((k + 3) % 8);
      sql.push(
        `INSERT OR IGNORE INTO bookings (court_id, date, start_time, end_time, member_id, partner_id)
         SELECT ${court}, '${addDays(monday, day)}', start_time, end_time, (SELECT id FROM members WHERE member_no = ${a}), (SELECT id FROM members WHERE member_no = ${b})
         FROM court_slots WHERE court_id = ${court} ORDER BY start_time LIMIT 1 OFFSET ${offset};`
      );
      k++;
    }
  }
}
sql.push("INSERT INTO applications (name, address, postcode, city, email, member_type) VALUES ('Ida Jensen', 'Skolevej 4', '7500', 'Holstebro', 'ida@example.dk', 'Junior');");
fs.writeFileSync('demo.sql', sql.join('\n') + '\n');
console.log('Skrev demo.sql. Kør: npx wrangler d1 execute DB --local --file demo.sql');
