import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { resetAdminCheck } from '../src/db.js';
import { hashPin } from '../src/security.js';
import { outbox } from '../src/notify.js';
import * as d from '../src/dates.js';
import { createD1 } from '../test-support/d1-shim.js';

let env, db;

before(async () => {
  const d1 = createD1();
  db = d1.raw;
  env = { DB: d1, QUIET: '1', MAIL_TEST: '1' };
  resetAdminCheck();
  const add = db.prepare('INSERT INTO members (member_no, pin_hash, name, email, mobile, max_bookings) VALUES (?, ?, ?, ?, ?, ?)');
  add.run(10, await hashPin('1111'), 'Anna Andersen', 'anna@example.dk', '20202020', 1);
  add.run(11, await hashPin('2222'), 'Bo Berg', 'bo@example.dk', '', 2);
  add.run(12, await hashPin('3333'), 'Carl Clausen', '', '', 1);
  // The first request creates the default administrator (members table is not empty, so do it here).
  db.prepare("INSERT INTO members (member_no, pin_hash, name, is_admin, max_bookings) VALUES (1, ?, 'Administrator', 1, 999)").run(await hashPin('1234'));
});

const id = (no) => db.prepare('SELECT id FROM members WHERE member_no = ?').get(no).id;

// Minimal browser: keeps cookies, reads the CSRF token from the last page.
function client(d1 = null) {
  const jar = {};
  let csrf = '';
  async function req(method, path, form) {
    const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') };
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams({ _csrf: csrf, ...form }).toString();
    }
    const res = await app.request(path, { method, headers, body }, d1 ? { DB: d1, QUIET: '1' } : env);
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (/Expires=Thu, 01 Jan 1970/.test(c)) delete jar[k];
      else jar[k] = v;
    }
    const text = await res.text();
    const m = text.match(/name="_csrf" value="([^"]+)"/);
    if (m) csrf = m[1];
    return { status: res.status, location: res.headers.get('location'), text };
  }
  return {
    get: (p) => req('GET', p),
    post: (p, f) => req('POST', p, f),
    async login(no, pin) {
      await req('GET', '/');
      const res = await req('POST', '/login', { member_no: String(no), pin });
      await req('GET', '/'); // pick up the logged-in session's CSRF token
      return res;
    },
  };
}

const tomorrow = () => d.addDays(d.today(), 1);
const court1 = () => db.prepare("SELECT id FROM courts WHERE name = 'Bane 1'").get().id;

test('ISO week helpers', () => {
  assert.deepEqual(d.isoWeek('2026-01-01'), { year: 2026, week: 1 });
  assert.deepEqual(d.isoWeek('2027-01-01'), { year: 2026, week: 53 });
  assert.deepEqual(d.isoWeek('2026-10-10'), { year: 2026, week: 41 });
  assert.equal(d.mondayOf(2026, 41), '2026-10-05');
  assert.equal(d.mondayOf(2027, 1), '2027-01-04');
  assert.equal(d.weeksInYear(2026), 53);
  assert.equal(d.weeksInYear(2025), 52);
});

test('migration seeds the same courts as the old site', () => {
  const slots = (name) => db.prepare('SELECT s.start_time, s.end_time FROM court_slots s JOIN courts c ON c.id = s.court_id WHERE c.name = ? ORDER BY s.start_time').all(name);
  assert.equal(slots('Bane 1').length, 15);
  assert.deepEqual(slots('Bane 1')[0], { start_time: '07:00', end_time: '08:00' });
  assert.equal(slots('Bane 2').length, 11);
  assert.deepEqual(slots('Bane 2').at(-1), { start_time: '21:30', end_time: '23:00' });
});

test('login rejects a wrong PIN and accepts the right one', async () => {
  const c = client();
  const bad = await c.login(10, '9999');
  assert.equal(bad.location, '/');
  assert.equal((await c.get('/booking')).status, 302);
  const ok = await c.login(10, '1111');
  assert.equal(ok.location, '/booking');
  const page = await c.get('/booking');
  assert.equal(page.status, 200);
  assert.match(page.text, /Anna Andersen/);
});

test('POST without CSRF token is refused', async () => {
  const c = client();
  await c.login(10, '1111');
  const res = await app.request('/logout', { method: 'POST' }, env);
  assert.equal(res.status, 403);
});

test('booking: create, conflict, limit, edit and delete rules', async () => {
  const anna = client();
  const bo = client();
  const carl = client();
  await anna.login(10, '1111');
  await bo.login(11, '2222');
  await carl.login(12, '3333');
  const slot = { bane: String(court1()), dato: tomorrow(), tid: '10:00' };

  const form = await anna.get(`/booking/ny?bane=${slot.bane}&dato=${slot.dato}&tid=${slot.tid}`);
  assert.match(form.text, /Hvem skal du spille med/);

  const made = await anna.post('/booking/ny', { ...slot, partner: String(id(11)) });
  assert.equal(made.status, 302);
  const b = db.prepare('SELECT * FROM bookings WHERE date = ? AND start_time = ?').get(slot.dato, '10:00');
  assert.equal(b.member_id, id(10));
  assert.equal(b.partner_id, id(11));

  // Same slot again is refused.
  const again = await carl.post('/booking/ny', { ...slot, partner: String(id(10)) });
  assert.equal(again.status, 400);

  // Anna's limit is 1 upcoming booking.
  const second = await anna.post('/booking/ny', { ...slot, tid: '11:00', partner: String(id(12)) });
  assert.equal(second.status, 400);
  assert.match(second.text, /allerede en kommende reservation/);

  // Bo is partner on Anna's booking (counts) and has a limit of 2, so one more is fine, then blocked.
  assert.equal((await bo.post('/booking/ny', { ...slot, tid: '12:00', partner: String(id(12)) })).status, 302);
  assert.equal((await bo.post('/booking/ny', { ...slot, tid: '13:00', partner: String(id(12)) })).status, 400);

  // Carl (not involved) cannot edit or delete Anna's booking.
  await carl.post(`/booking/${b.id}/slet`, {});
  assert.ok(db.prepare('SELECT 1 FROM bookings WHERE id = ?').get(b.id));
  const carlEdit = await carl.get(`/booking/${b.id}/ret`);
  assert.equal(carlEdit.status, 302);

  // Anna (creator) can change partner; Bo (partner) can delete.
  await anna.get(`/booking/${b.id}/ret`);
  await anna.post(`/booking/${b.id}/ret`, { partner: String(id(12)) });
  assert.equal(db.prepare('SELECT partner_id FROM bookings WHERE id = ?').get(b.id).partner_id, id(12));
  await carl.get('/booking');
  await carl.post(`/booking/${b.id}/slet`, {});
  assert.equal(db.prepare('SELECT 1 FROM bookings WHERE id = ?').get(b.id), undefined);

  // My bookings page lists Bo's remaining booking.
  const mine = await bo.get('/mine-reservationer');
  assert.match(mine.text, /12:00/);
  db.prepare('DELETE FROM bookings').run();
});

test('cannot book a slot in the past', async () => {
  const c = client();
  await c.login(10, '1111');
  const res = await c.post('/booking/ny', { bane: String(court1()), dato: d.addDays(d.today(), -1), tid: '10:00', partner: String(id(11)) });
  assert.equal(res.status, 400);
  assert.match(res.text, /overstået/);
});

test('week grid shows bookings with names', async () => {
  db.prepare('INSERT INTO bookings (court_id, date, start_time, end_time, member_id, partner_id) VALUES (?, ?, ?, ?, ?, ?)').run(
    court1(), tomorrow(), '09:00', '10:00', id(11), id(12)
  );
  const c = client();
  await c.login(10, '1111');
  const { year, week } = d.isoWeek(tomorrow());
  const page = await c.get(`/booking?bane=${court1()}&aar=${year}&uge=${week}`);
  assert.match(page.text, /Bo Berg/);
  assert.match(page.text, /Carl Clausen/);
  db.prepare('DELETE FROM bookings').run();
});

test('non-admins cannot reach administration', async () => {
  const c = client();
  await c.login(10, '1111');
  assert.equal((await c.get('/admin/medlemmer')).status, 403);
});

test('admin creates a member, who can log in', async () => {
  const admin = client();
  await admin.login(1, '1234');
  await admin.get('/admin/medlemmer/ny');
  const created = await admin.post('/admin/medlemmer/ny', {
    member_no: '20', name: 'Dina Dahl', email: 'dina@example.dk', is_admin: '0', max_bookings: '1', pin: '4321', send_email: '1',
  });
  assert.equal(created.location, '/admin/medlemmer');
  assert.ok(outbox.some((m) => m.to === 'dina@example.dk' && /4321/.test(m.text)));

  const dina = client();
  assert.equal((await dina.login(20, '4321')).location, '/booking');

  // Duplicate member numbers are refused.
  await admin.get('/admin/medlemmer/ny');
  const dup = await admin.post('/admin/medlemmer/ny', { member_no: '20', name: 'X', pin: '1234', max_bookings: '1' });
  assert.equal(dup.status, 400);
});

test('welcome mail only when ticked; forgotten PIN is only changed when the mail goes out', async () => {
  const admin = client();
  await admin.login(1, '1234');
  await admin.get('/admin/medlemmer/ny');
  const before = outbox.length;
  await admin.post('/admin/medlemmer/ny', { member_no: '21', name: 'Eva Ek', email: 'eva@example.dk', is_admin: '0', max_bookings: '1', pin: '2468' });
  assert.equal(outbox.length, before);

  // No mail service: the member keeps the old PIN.
  delete env.MAIL_TEST;
  try {
    const v = client();
    await v.get('/glemt-pinkode');
    await v.post('/glemt-pinkode', { member_no: '21' });
    assert.equal((await client().login(21, '2468')).location, '/booking');
  } finally {
    env.MAIL_TEST = '1';
  }
});

test('admin can promote and demote members from the list', async () => {
  const admin = client();
  await admin.login(1, '1234');
  const list = await admin.get('/admin/medlemmer');
  assert.match(list.text, /Gør til admin/);
  await admin.post(`/admin/medlemmer/${id(11)}/admin`, { admin: '1' });
  assert.equal(db.prepare('SELECT is_admin FROM members WHERE member_no = 11').get().is_admin, 1);
  await admin.post(`/admin/medlemmer/${id(11)}/admin`, { admin: '0' });
  assert.equal(db.prepare('SELECT is_admin FROM members WHERE member_no = 11').get().is_admin, 0);
  // Your own rights can't be removed this way.
  await admin.post(`/admin/medlemmer/${id(1)}/admin`, { admin: '0' });
  assert.equal(db.prepare('SELECT is_admin FROM members WHERE member_no = 1').get().is_admin, 1);
  // Non-admins can't use it.
  const anna = client();
  await anna.login(10, '1111');
  assert.equal((await anna.post(`/admin/medlemmer/${id(10)}/admin`, { admin: '1' })).status, 403);
});

test('the site is only for court booking', async () => {
  for (const path of ['/bliv-medlem', '/om-klubben', '/kontakt', '/turnering', '/sponsorer']) {
    assert.equal((await client().get(path)).status, 404, path);
  }
  const admin = client();
  await admin.login(1, '1234');
  assert.equal((await admin.get('/admin/indmeldelser')).status, 404);
  const front = await client().get('/');
  assert.doesNotMatch(front.text, /Bliv medlem|Om klubben/);
  assert.match(front.text, /Log ind/);
});

test('deactivated members are logged out and lose upcoming bookings', async () => {
  const carl = client();
  await carl.login(12, '3333');
  await carl.get('/booking');
  await carl.post('/booking/ny', { bane: String(court1()), dato: tomorrow(), tid: '15:00', partner: String(id(10)) });
  assert.ok(db.prepare('SELECT 1 FROM bookings WHERE member_id = ?').get(id(12)));

  const admin = client();
  await admin.login(1, '1234');
  await admin.get('/admin/medlemmer');
  await admin.post(`/admin/medlemmer/${id(12)}/deaktiver`, {});
  assert.equal(db.prepare('SELECT active FROM members WHERE member_no = 12').get().active, 0);
  assert.equal(db.prepare('SELECT 1 FROM bookings WHERE member_id = ?').get(id(12)), undefined);
  assert.equal((await carl.get('/booking')).status, 302);
  assert.equal((await client().login(12, '3333')).location, '/');

  await admin.post(`/admin/medlemmer/${id(12)}/aktiver`, {});
  assert.equal((await client().login(12, '3333')).location, '/booking');
});

test('change PIN and forgotten PIN', async () => {
  const bo = client();
  await bo.login(11, '2222');
  await bo.get('/skift-pinkode');
  const wrong = await bo.post('/skift-pinkode', { current: '0000', pin: '5555', pin2: '5555' });
  assert.equal(wrong.status, 400);
  await bo.post('/skift-pinkode', { current: '2222', pin: '5555', pin2: '5555' });
  assert.equal((await client().login(11, '5555')).location, '/booking');

  const v = client();
  await v.get('/glemt-pinkode');
  const res = await v.post('/glemt-pinkode', { email: 'bo@example.dk' });
  assert.match(res.text, /sendt en ny pinkode/);
  const mail = outbox.filter((m) => m.to === 'bo@example.dk').at(-1);
  const newPin = mail.text.match(/pinkode til banebookingen er: (\d+)/)[1];
  assert.equal((await client().login(11, newPin)).location, '/booking');
});

test('admin edits courts and time slots', async () => {
  const admin = client();
  await admin.login(1, '1234');
  const page = await admin.get('/admin/baner');
  assert.match(page.text, /06:30-08:00/);
  const courts = db.prepare('SELECT * FROM courts ORDER BY sort').all();
  const form = {};
  for (const c of courts) {
    form[`name_${c.id}`] = c.name;
    form[`sort_${c.id}`] = String(c.sort);
    form[`active_${c.id}`] = '1';
    form[`slots_${c.id}`] = c.name === 'Bane 1' ? '08:00-09:00\n09:00-10:00' : '10:00-11:30';
  }
  const bad = await admin.post('/admin/baner', { ...form, [`slots_${courts[0].id}`]: '08:00-09:30\n09:00-10:00' });
  assert.equal(bad.status, 400);
  assert.match(bad.text, /overlapper/);
  await admin.post('/admin/baner', { ...form, new_name: 'Bane 3', new_slots: '8:00-9:00' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM court_slots WHERE court_id = ?').get(courts[0].id).n, 2);
  const b3 = db.prepare("SELECT id FROM courts WHERE name = 'Bane 3'").get();
  assert.deepEqual(db.prepare('SELECT start_time, end_time FROM court_slots WHERE court_id = ?').get(b3.id), { start_time: '08:00', end_time: '09:00' });
});

test('member-entered text is escaped in pages', async () => {
  const bo = client();
  await bo.login(11, (await (async () => {
    const mail = outbox.filter((m) => m.to === 'bo@example.dk').at(-1);
    return mail.text.match(/pinkode til banebookingen er: (\d+)/)[1];
  })()));
  await bo.get('/profil');
  await bo.post('/profil', { name: '<script>alert(1)</script>', email: 'bo@example.dk' });
  const page = await bo.get('/profil');
  assert.doesNotMatch(page.text, /<script>alert/);
  assert.match(page.text, /&lt;script&gt;alert/);
});

test('an empty database gets an administrator only when ADMIN_PIN is set', async () => {
  const none = { DB: createD1(), QUIET: '1' };
  resetAdminCheck();
  assert.equal((await app.request('/', {}, none)).status, 200);
  assert.equal(none.DB.raw.prepare('SELECT COUNT(*) AS n FROM members').get().n, 0);

  const fresh = { DB: createD1(), QUIET: '1', ADMIN_PIN: '9090', ADMIN_MEMBER_NO: '42' };
  resetAdminCheck();
  const res = await app.request('/', {}, fresh);
  assert.equal(res.status, 200);
  const row = fresh.DB.raw.prepare('SELECT member_no, is_admin FROM members').get();
  assert.deepEqual(row, { member_no: 42, is_admin: 1 });
  resetAdminCheck();
});

test('create-admin script makes an administrator and removes the unused default one', async () => {
  const { execFileSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-'));
  const script = path.join(import.meta.dirname, '..', 'scripts', 'create-admin.js');
  const env = { ...process.env, GITHUB_EVENT_PATH: '' };
  execFileSync(process.execPath, [script, '42', '2069', 'René'], { cwd: dir, env, stdio: 'pipe' });
  const sql = fs.readFileSync(path.join(dir, 'create-admin.sql'), 'utf8');
  assert.doesNotMatch(sql, /2069/);

  const d1 = createD1();
  d1.raw.prepare("INSERT INTO members (member_no, pin_hash, name, is_admin, max_bookings) VALUES (1, ?, 'Administrator', 1, 999)").run(await hashPin('1234'));
  d1.raw.exec(sql);
  assert.deepEqual(d1.raw.prepare('SELECT member_no, name, is_admin FROM members').all(), [{ member_no: 42, name: 'René', is_admin: 1 }]);
  resetAdminCheck();
  const c = client(d1);
  assert.equal((await c.login(42, '2069')).location, '/booking');
  assert.equal((await c.get('/admin/medlemmer')).status, 200);
  resetAdminCheck();
});
