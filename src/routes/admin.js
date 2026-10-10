import { Hono } from 'hono';
import { all, first, run, logEvent, SETTING_KEYS } from '../db.js';
import { requireAdmin, flash } from '../session.js';
import { hashPin, randomPin, isValidPin } from '../security.js';
import { sendEmail, sendSms } from '../notify.js';
import { isValidIsoDate, today } from '../dates.js';
import { render } from '../views/layout.js';

const MEMBER_FIELDS = ['name', 'address', 'postcode', 'city', 'email', 'phone', 'mobile', 'birthdate'];
const BOOKING_LIMITS = [1, 2, 3, 5, 10, 999];

function readMember(f) {
  const x = Object.fromEntries(MEMBER_FIELDS.map((k) => [k, String(f[k] || '').trim()]));
  x.member_no = parseInt(f.member_no, 10);
  x.is_admin = f.is_admin === '1' ? 1 : 0;
  x.max_bookings = BOOKING_LIMITS.includes(Number(f.max_bookings)) ? Number(f.max_bookings) : 1;
  x.pin = String(f.pin || '').trim();
  return x;
}

const csvCell = (x) => {
  const s = String(x ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const getMember = (db, id) => first(db, 'SELECT * FROM members WHERE id = ?', Number(id) || 0);

async function validateMember(db, x, id) {
  if (!Number.isInteger(x.member_no) || x.member_no < 1) return 'Medlemsnummer skal være et positivt tal.';
  const taken = await first(db, 'SELECT id, name FROM members WHERE member_no = ? AND id <> ?', x.member_no, id ?? -1);
  if (taken) return `Medlemsnummer ${x.member_no} bruges allerede af ${taken.name}.`;
  if (!x.name) return 'Navn skal udfyldes.';
  if (x.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email)) return 'E-mailadressen ser ikke rigtig ud.';
  if (x.birthdate && !isValidIsoDate(x.birthdate)) return 'Fødselsdatoen er ugyldig.';
  if ((id == null || x.pin) && !isValidPin(x.pin)) return 'Pinkoden skal være 4 til 8 cifre.';
  return null;
}

async function sendLogin(c, m, pin, { email, sms }, isNew) {
  const s = c.get('settings');
  const sent = [];
  const intro = isNew ? `Du er oprettet som bruger i ${s.club_name}s bookingsystem.` : `Du har fået en ny pinkode til ${s.club_name}s bookingsystem.`;
  if (email && m.email) {
    await sendEmail(c.env, {
      to: m.email,
      from: `${s.club_name} <${s.club_email}>`,
      subject: `${s.club_name} - Dit login`,
      text: `Kære ${m.name}\n\n${intro}\n\nDit medlemsnummer: ${m.member_no}\nDin pinkode: ${pin}\n\nNår du er logget ind, kan du rette dine oplysninger og skifte pinkode.\n\nMed venlig hilsen\n${s.club_name}`,
    });
    sent.push('e-mail');
  }
  if (sms && m.mobile) {
    await sendSms(c.env, { to: m.mobile, from: s.sms_sender, message: `${intro} Medlemsnr.: ${m.member_no} Pinkode: ${pin}` });
    sent.push('SMS');
  }
  return sent;
}

const r = new Hono();
r.use('*', requireAdmin);
const view = (c, name, props, status) => render(c, name, props, status);

r.get('/', (c) => c.redirect('/admin/medlemmer'));

// Members
r.get('/medlemmer', async (c) => {
  const list = await all(c.get('db'), 'SELECT * FROM members ORDER BY member_no');
  return view(c, 'admin_members', { active: list.filter((m) => m.active), inactive: list.filter((m) => !m.active) });
});

r.get('/medlemmer/print', async (c) =>
  view(c, 'admin_members_print', { list: await all(c.get('db'), 'SELECT * FROM members WHERE active = 1 ORDER BY member_no') })
);

r.get('/medlemmer.csv', async (c) => {
  const cols = ['member_no', 'name', 'address', 'postcode', 'city', 'email', 'phone', 'mobile', 'birthdate', 'is_admin', 'max_bookings', 'active', 'created_at'];
  const rows = await all(c.get('db'), `SELECT ${cols.join(', ')} FROM members ORDER BY member_no`);
  const csv = [cols.join(';'), ...rows.map((row) => cols.map((k) => csvCell(row[k])).join(';'))].join('\r\n');
  return c.body('﻿' + csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="medlemmer.csv"',
  });
});

const formProps = (extra) => ({ limits: BOOKING_LIMITS, error: null, ...extra });

r.get('/medlemmer/ny', async (c) => {
  const { n } = await first(c.get('db'), 'SELECT COALESCE(MAX(member_no), 0) + 1 AS n FROM members');
  const values = { member_no: n, pin: randomPin(4), max_bookings: 1, is_admin: 0 };
  return view(c, 'admin_member_form', formProps({ values, isNew: true }));
});

r.post('/medlemmer/ny', async (c) => {
  const db = c.get('db');
  const f = c.get('form');
  const x = readMember(f);
  const error = await validateMember(db, x);
  if (error) return view(c, 'admin_member_form', formProps({ values: x, error, isNew: true }), 400);
  await run(
    db,
    `INSERT INTO members (member_no, pin_hash, name, address, postcode, city, email, phone, mobile, birthdate, is_admin, max_bookings, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    x.member_no, await hashPin(x.pin), x.name, x.address, x.postcode, x.city, x.email, x.phone, x.mobile, x.birthdate,
    x.is_admin, x.max_bookings, c.get('member').name
  );
  await logEvent(c, `Medlem oprettet: ${x.member_no} - ${x.name}`);
  const sent = await sendLogin(c, x, x.pin, { email: f.send_email === '1', sms: f.send_sms === '1' }, true);
  flash(c, `${x.name} er oprettet som medlem nr. ${x.member_no}.` + (sent.length ? ` Login er sendt pr. ${sent.join(' og ')}.` : ''));
  return c.redirect('/admin/medlemmer');
});

r.get('/medlemmer/:id', async (c) => {
  const m = await getMember(c.get('db'), c.req.param('id'));
  if (!m) return c.redirect('/admin/medlemmer');
  return view(c, 'admin_member_form', formProps({ values: { ...m, pin: '' }, isNew: false }));
});

r.post('/medlemmer/:id', async (c) => {
  const db = c.get('db');
  const me = c.get('member');
  const f = c.get('form');
  const m = await getMember(db, c.req.param('id'));
  if (!m) return c.redirect('/admin/medlemmer');
  const x = readMember(f);
  let error = await validateMember(db, x, m.id);
  if (!error && m.id === me.id && !x.is_admin) error = 'Du kan ikke fjerne dine egne administratorrettigheder.';
  if (error) return view(c, 'admin_member_form', formProps({ values: { ...m, ...x }, error, isNew: false }), 400);
  await run(
    db,
    `UPDATE members SET member_no=?, name=?, address=?, postcode=?, city=?, email=?, phone=?, mobile=?, birthdate=?,
     is_admin=?, max_bookings=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    x.member_no, x.name, x.address, x.postcode, x.city, x.email, x.phone, x.mobile, x.birthdate, x.is_admin, x.max_bookings, me.name, m.id
  );
  let sent = [];
  if (x.pin) {
    await db.batch([
      db.prepare('UPDATE members SET pin_hash = ? WHERE id = ?').bind(await hashPin(x.pin), m.id),
      db.prepare('DELETE FROM sessions WHERE member_id = ? AND token <> ?').bind(m.id, c.get('sessionToken') ?? ''),
    ]);
    sent = await sendLogin(c, x, x.pin, { email: f.send_email === '1', sms: f.send_sms === '1' }, false);
  }
  await logEvent(c, `Medlem rettet: ${x.member_no} - ${x.name}${x.pin ? ' (ny pinkode)' : ''}`);
  flash(c, `${x.name} er opdateret.` + (sent.length ? ` Ny pinkode er sendt pr. ${sent.join(' og ')}.` : ''));
  return c.redirect('/admin/medlemmer');
});

r.post('/medlemmer/:id/deaktiver', async (c) => {
  const db = c.get('db');
  const me = c.get('member');
  const m = await getMember(db, c.req.param('id'));
  if (m && m.id !== me.id) {
    await db.batch([
      db.prepare("UPDATE members SET active = 0, updated_at = datetime('now'), updated_by = ? WHERE id = ?").bind(me.name, m.id),
      db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(m.id),
      // Upcoming bookings made by an inactive member would block the court, so they are released.
      db.prepare('DELETE FROM bookings WHERE member_id = ? AND date >= ?').bind(m.id, today()),
    ]);
    await logEvent(c, `Medlem deaktiveret: ${m.member_no} - ${m.name}`);
    flash(c, `${m.name} er deaktiveret, og medlemmets kommende reservationer er slettet.`);
  }
  return c.redirect('/admin/medlemmer');
});

// Give or take away administrator rights straight from the members list.
r.post('/medlemmer/:id/admin', async (c) => {
  const db = c.get('db');
  const me = c.get('member');
  const m = await getMember(db, c.req.param('id'));
  const makeAdmin = c.get('form').admin === '1' ? 1 : 0;
  if (m && m.id !== me.id && m.active) {
    await run(db, "UPDATE members SET is_admin = ?, max_bookings = CASE WHEN ? = 1 THEN 999 ELSE max_bookings END, updated_at = datetime('now'), updated_by = ? WHERE id = ?",
      makeAdmin, makeAdmin, me.name, m.id);
    await logEvent(c, `${makeAdmin ? 'Gjort til administrator' : 'Ikke længere administrator'}: ${m.member_no} - ${m.name}`);
    flash(c, makeAdmin ? `${m.name} er nu administrator.` : `${m.name} er ikke længere administrator.`);
  }
  return c.redirect('/admin/medlemmer');
});

r.post('/medlemmer/:id/aktiver', async (c) => {
  const db = c.get('db');
  const m = await getMember(db, c.req.param('id'));
  if (m) {
    await run(db, "UPDATE members SET active = 1, updated_at = datetime('now'), updated_by = ? WHERE id = ?", c.get('member').name, m.id);
    await logEvent(c, `Medlem aktiveret: ${m.member_no} - ${m.name}`);
    flash(c, `${m.name} er aktiveret igen.`);
  }
  return c.redirect('/admin/medlemmer');
});

r.post('/medlemmer/:id/slet', async (c) => {
  const db = c.get('db');
  const m = await getMember(db, c.req.param('id'));
  if (m && !m.active && m.id !== c.get('member').id) {
    await run(db, 'DELETE FROM members WHERE id = ?', m.id);
    await logEvent(c, `Medlem slettet permanent: ${m.member_no} - ${m.name}`);
    flash(c, `${m.name} er slettet permanent.`);
  }
  return c.redirect('/admin/medlemmer');
});

// Courts and time slots
export function parseSlots(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})$/);
    if (!m) throw new Error(`Kan ikke læse tidsrummet "${line}". Skriv fx 08:00-09:30.`);
    const s = `${m[1].padStart(2, '0')}:${m[2]}`;
    const e = `${m[3].padStart(2, '0')}:${m[4]}`;
    if (s >= e || s > '23:59' || e > '24:00') throw new Error(`Tidsrummet "${line}" er ugyldigt.`);
    out.push([s, e]);
  }
  out.sort((a, b) => a[0].localeCompare(b[0]));
  for (let i = 1; i < out.length; i++) {
    if (out[i][0] < out[i - 1][1]) throw new Error(`Tidsrummene ${out[i - 1].join('-')} og ${out[i].join('-')} overlapper.`);
  }
  return out;
}

async function courtsWithSlots(db) {
  const courts = await all(db, 'SELECT * FROM courts ORDER BY sort, id');
  const slots = await all(db, 'SELECT * FROM court_slots ORDER BY start_time');
  for (const c of courts) c.slotText = slots.filter((s) => s.court_id === c.id).map((s) => `${s.start_time}-${s.end_time}`).join('\n');
  return courts;
}

r.get('/baner', async (c) => view(c, 'admin_courts', { courts: await courtsWithSlots(c.get('db')), error: null }));

r.post('/baner', async (c) => {
  const db = c.get('db');
  const f = c.get('form');
  const courts = await courtsWithSlots(db);
  try {
    const updates = courts.map((ct) => ({
      id: ct.id,
      name: String(f[`name_${ct.id}`] || '').trim() || ct.name,
      sort: parseInt(f[`sort_${ct.id}`], 10) || 0,
      active: f[`active_${ct.id}`] === '1' ? 1 : 0,
      slots: parseSlots(f[`slots_${ct.id}`]),
    }));
    const newName = String(f.new_name || '').trim();
    const newSlots = newName ? parseSlots(f.new_slots) : [];
    const stmts = [];
    const addSlot = (courtId, s, e) => db.prepare('INSERT INTO court_slots (court_id, start_time, end_time) VALUES (?, ?, ?)').bind(courtId, s, e);
    for (const u of updates) {
      stmts.push(db.prepare('UPDATE courts SET name = ?, sort = ?, active = ? WHERE id = ?').bind(u.name, u.sort, u.active, u.id));
      stmts.push(db.prepare('DELETE FROM court_slots WHERE court_id = ?').bind(u.id));
      for (const [s, e] of u.slots) stmts.push(addSlot(u.id, s, e));
    }
    await db.batch(stmts);
    if (newName) {
      const res = await run(db, 'INSERT INTO courts (name, sort) VALUES (?, ?)', newName, courts.length + 1);
      if (newSlots.length) await db.batch(newSlots.map(([s, e]) => addSlot(res.meta.last_row_id, s, e)));
    }
    await logEvent(c, 'Baner og tider opdateret');
    flash(c, 'Baner og tider er gemt.');
    return c.redirect('/admin/baner');
  } catch (e) {
    if (!e.message.startsWith('Tidsrum') && !e.message.startsWith('Kan ikke')) throw e;
    for (const ct of courts) ct.slotText = f[`slots_${ct.id}`];
    return view(c, 'admin_courts', { courts, error: e.message }, 400);
  }
});

// Settings and texts
r.get('/indstillinger', (c) => view(c, 'admin_settings'));

r.post('/indstillinger', async (c) => {
  const db = c.get('db');
  const f = c.get('form');
  const stmts = [];
  for (const k of SETTING_KEYS) {
    if (k in f) {
      stmts.push(
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
          .bind(k, String(f[k]).replace(/\r\n/g, '\n').trim())
      );
    }
  }
  await db.batch(stmts);
  await logEvent(c, 'Indstillinger opdateret');
  flash(c, 'Indstillingerne er gemt.');
  return c.redirect('/admin/indstillinger');
});

r.get('/log', async (c) => view(c, 'admin_log', { list: await all(c.get('db'), 'SELECT * FROM log ORDER BY id DESC LIMIT 500') }));

export default r;
