import { Hono } from 'hono';
import { all, first, run, logEvent } from '../db.js';
import { requireLogin, flash } from '../session.js';
import { render } from '../views/layout.js';
import * as d from '../dates.js';

const BOOKING_SELECT = `SELECT b.*, c.name AS court_name, m.member_no AS m_no, m.name AS m_name, p.member_no AS p_no, p.name AS p_name
  FROM bookings b JOIN courts c ON c.id = b.court_id JOIN members m ON m.id = b.member_id
  LEFT JOIN members p ON p.id = b.partner_id`;

export const canDelete = (member, b) => !!member.is_admin || b.member_id === member.id || b.partner_id === member.id;
export const canEdit = (member, b) => !!member.is_admin || b.member_id === member.id;

function isPast(date, time) {
  const t = d.today();
  return date < t || (date === t && time <= d.nowTime());
}

function weekUrl(courtId, date) {
  const { year, week } = d.isoWeek(date);
  return `/booking?bane=${courtId}&aar=${year}&uge=${week}`;
}

const partners = (db, excludeId) => all(db, 'SELECT id, member_no, name FROM members WHERE active = 1 AND id <> ? ORDER BY member_no', excludeId);
const getBooking = (db, id) => first(db, `${BOOKING_SELECT} WHERE b.id = ?`, Number(id) || 0);

const r = new Hono();
r.use('/booking', requireLogin);
r.use('/booking/*', requireLogin);
r.use('/mine-reservationer', requireLogin);

r.get('/booking', async (c) => {
  const db = c.get('db');
  const courts = await all(db, 'SELECT * FROM courts WHERE active = 1 ORDER BY sort, id');
  if (!courts.length) return render(c, 'message', { title: 'Booking', text: 'Der er ingen baner sat op endnu.' });
  const court = courts.find((x) => x.id === Number(c.req.query('bane'))) || courts[0];

  const current = d.isoWeek(d.today());
  const year = parseInt(c.req.query('aar'), 10) || current.year;
  const weeks = d.weeksInYear(year);
  const week = Math.min(Math.max(parseInt(c.req.query('uge'), 10) || current.week, 1), weeks);
  const monday = d.mondayOf(year, week);
  const days = Array.from({ length: 7 }, (_, i) => d.addDays(monday, i));

  const [slots, bookings] = await Promise.all([
    all(db, 'SELECT * FROM court_slots WHERE court_id = ? ORDER BY start_time', court.id),
    all(db, `${BOOKING_SELECT} WHERE b.court_id = ? AND b.date BETWEEN ? AND ?`, court.id, days[0], days[6]),
  ]);
  const grid = Object.fromEntries(bookings.map((b) => [`${b.date}|${b.start_time}`, b]));
  const ahead = Number(c.get('settings').booking_days_ahead);

  return render(c, 'booking', {
    courts, court, year, week, weeks, days, slots, grid, current,
    prev: d.isoWeek(d.addDays(monday, -7)),
    next: d.isoWeek(d.addDays(monday, 7)),
    lastDay: ahead > 0 ? d.addDays(d.today(), ahead) : null,
    isPast, canEdit, canDelete,
  });
});

async function slotFrom(db, src) {
  const court = await first(db, 'SELECT * FROM courts WHERE id = ? AND active = 1', Number(src.bane) || 0);
  const date = String(src.dato || '');
  if (!court || !d.isValidIsoDate(date)) return null;
  const slot = await first(db, 'SELECT * FROM court_slots WHERE court_id = ? AND start_time = ?', court.id, String(src.tid || ''));
  return slot ? { court, date, slot } : null;
}

// Reasons a member may not book this slot at all (as opposed to a form mistake).
async function bookingError(c, { date, slot }) {
  const me = c.get('member');
  if (isPast(date, slot.start_time)) return 'Tiden er allerede overstået.';
  const ahead = Number(c.get('settings').booking_days_ahead);
  if (ahead > 0 && !me.is_admin && date > d.addDays(d.today(), ahead)) return `Du kan højst booke ${ahead} dage frem.`;
  // Bookings after today count against the limit; on the day of play you may book again (as in the old system).
  if (me.max_bookings < 999 && date > d.today()) {
    const { n } = await first(c.get('db'), 'SELECT COUNT(*) AS n FROM bookings WHERE (member_id = ? OR partner_id = ?) AND date > ?', me.id, me.id, d.today());
    if (n >= me.max_bookings) {
      return me.max_bookings === 1
        ? 'Du har allerede en kommende reservation. Slet den, eller vent til dagen hvor du spiller, før du booker igen.'
        : `Du har allerede ${n} kommende reservationer, som er det maksimale. Slet en af dem for at booke en ny.`;
    }
  }
  return null;
}

r.get('/booking/ny', async (c) => {
  const db = c.get('db');
  const ctx = await slotFrom(db, c.req.query());
  if (!ctx) return c.redirect('/booking');
  const error = await bookingError(c, ctx);
  return render(c, 'booking_form', {
    ...ctx, error, blocked: !!error, booking: null, partners: await partners(db, c.get('member').id), back: weekUrl(ctx.court.id, ctx.date),
  });
});

r.post('/booking/ny', async (c) => {
  const db = c.get('db');
  const me = c.get('member');
  const f = c.get('form');
  const ctx = await slotFrom(db, f);
  if (!ctx) return c.redirect('/booking');
  const back = weekUrl(ctx.court.id, ctx.date);
  const partner = await first(db, 'SELECT * FROM members WHERE id = ? AND active = 1', Number(f.partner) || 0);
  let error = await bookingError(c, ctx);
  const blocked = !!error;
  if (!error && (!partner || partner.id === me.id)) error = 'Vælg hvem du skal spille med.';
  if (!error) {
    try {
      await run(
        db,
        'INSERT INTO bookings (court_id, date, start_time, end_time, member_id, partner_id) VALUES (?, ?, ?, ?, ?, ?)',
        ctx.court.id, ctx.date, ctx.slot.start_time, ctx.slot.end_time, me.id, partner.id
      );
    } catch (e) {
      if (!/UNIQUE/i.test(String(e.message))) throw e;
      error = 'Tiden er netop blevet booket af en anden.';
    }
  }
  if (error) {
    return render(c, 'booking_form', { ...ctx, error, blocked, booking: null, partners: await partners(db, me.id), back }, 400);
  }
  await logEvent(c, `Booking oprettet: ${ctx.court.name} ${d.formatDate(ctx.date)} kl. ${ctx.slot.start_time} med ${partner.member_no}`);
  flash(c, `${ctx.court.name} er booket ${d.dayName(ctx.date).toLowerCase()} d. ${d.formatDate(ctx.date)} kl. ${ctx.slot.start_time}.`);
  return c.redirect(back);
});

function editProps(b, extra) {
  return {
    court: { id: b.court_id, name: b.court_name }, date: b.date, slot: { start_time: b.start_time, end_time: b.end_time },
    booking: b, blocked: false, back: weekUrl(b.court_id, b.date), ...extra,
  };
}

r.get('/booking/:id/ret', async (c) => {
  const db = c.get('db');
  const b = await getBooking(db, c.req.param('id'));
  if (!b || !canEdit(c.get('member'), b)) return c.redirect('/booking');
  return render(c, 'booking_form', editProps(b, { error: null, partners: await partners(db, b.member_id) }));
});

r.post('/booking/:id/ret', async (c) => {
  const db = c.get('db');
  const me = c.get('member');
  const b = await getBooking(db, c.req.param('id'));
  if (!b || !canEdit(me, b)) return c.redirect('/booking');
  const partner = await first(db, 'SELECT * FROM members WHERE id = ? AND active = 1', Number(c.get('form').partner) || 0);
  if (!partner || partner.id === b.member_id) {
    return render(c, 'booking_form', editProps(b, { error: 'Vælg hvem der skal spilles med.', partners: await partners(db, b.member_id) }), 400);
  }
  await run(db, "UPDATE bookings SET partner_id = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?", partner.id, me.id, b.id);
  await logEvent(c, `Booking rettet: ${b.court_name} ${d.formatDate(b.date)} kl. ${b.start_time}, makker nu ${partner.member_no}`);
  flash(c, 'Reservationen er opdateret.');
  return c.redirect(weekUrl(b.court_id, b.date));
});

r.post('/booking/:id/slet', async (c) => {
  const db = c.get('db');
  const b = await getBooking(db, c.req.param('id'));
  if (b && canDelete(c.get('member'), b)) {
    await run(db, 'DELETE FROM bookings WHERE id = ?', b.id);
    await logEvent(c, `Booking slettet: ${b.court_name} ${d.formatDate(b.date)} kl. ${b.start_time} (${b.m_no}/${b.p_no ?? '-'})`);
    flash(c, 'Reservationen er slettet.');
  }
  const back = c.get('form').back;
  return c.redirect(back?.startsWith('/') && !back.startsWith('//') ? back : '/booking');
});

r.get('/mine-reservationer', async (c) => {
  const me = c.get('member');
  const rows = await all(c.get('db'), `${BOOKING_SELECT} WHERE (b.member_id = ? OR b.partner_id = ?) AND b.date >= ? ORDER BY b.date, b.start_time`, me.id, me.id, d.today());
  const list = rows.filter((b) => !isPast(b.date, b.end_time));
  const counted = list.filter((b) => b.date > d.today()).length;
  return render(c, 'mine', { list, counted, canEdit, canDelete });
});

export default r;
