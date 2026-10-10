import { Hono } from 'hono';
import { first, run, logEvent } from '../db.js';
import { verifyPin, hashPin, randomPin, throttle } from '../security.js';
import { sendEmail } from '../notify.js';
import { render } from '../views/layout.js';
import { login, logout, flash } from '../session.js';

const FIFTEEN_MIN = 15 * 60 * 1000;

const r = new Hono();

r.get('/', (c) => render(c, 'index'));

r.post('/login', async (c) => {
  const db = c.get('db');
  const f = c.get('form');
  const memberNo = parseInt(f.member_no, 10);
  const byMember = throttle(db, `login:${memberNo}`, { max: 5, windowMs: FIFTEEN_MIN });
  const byIp = throttle(db, `ip:${c.get('ip')}`, { max: 30, windowMs: FIFTEEN_MIN });
  if ((await byMember.blocked()) || (await byIp.blocked())) {
    flash(c, 'For mange forkerte forsøg. Vent 15 minutter og prøv igen.');
    return c.redirect('/');
  }
  const m = Number.isInteger(memberNo) ? await first(db, 'SELECT * FROM members WHERE member_no = ? AND active = 1', memberNo) : null;
  if (!m || !(await verifyPin(f.pin || '', m.pin_hash))) {
    await byMember.fail();
    await byIp.fail();
    flash(c, 'Forkert medlemsnummer eller pinkode.');
    return c.redirect('/');
  }
  await byMember.reset();
  await login(c, m.id);
  await logEvent(c, 'Logget ind', m);
  return c.redirect('/booking');
});

r.post('/logout', async (c) => {
  await logout(c);
  return c.redirect('/');
});

r.get('/glemt-pinkode', (c) => render(c, 'lost', { sent: false, error: null }));

r.post('/glemt-pinkode', async (c) => {
  const db = c.get('db');
  const { member_no = '', email = '' } = c.get('form');
  const t = throttle(db, `lost:${c.get('ip')}`, { max: 5, windowMs: 4 * FIFTEEN_MIN });
  if (await t.blocked()) return render(c, 'lost', { sent: false, error: 'For mange forsøg. Prøv igen senere.' });
  await t.fail();
  let m;
  if (member_no.trim()) m = await first(db, 'SELECT * FROM members WHERE member_no = ? AND active = 1', parseInt(member_no, 10) || -1);
  else if (email.trim()) m = await first(db, 'SELECT * FROM members WHERE lower(email) = lower(?) AND active = 1', email.trim());
  else return render(c, 'lost', { sent: false, error: 'Udfyld ét af felterne.' });

  if (m && m.email) {
    const s = c.get('settings');
    const pin = randomPin(4);
    // The PIN only changes when the mail actually went out, so nobody is locked out by a failed mail.
    const ok = await sendEmail(c.env, {
      to: m.email,
      from: `${s.club_name} <${s.club_email}>`,
      subject: `${s.club_name} - Ny pinkode`,
      text: `Kære ${m.name}\n\nDin nye pinkode til banebookingen er: ${pin}\nDit medlemsnummer er: ${m.member_no}\n\nLog ind på ${new URL(c.req.url).origin}\nDu kan skifte pinkoden, når du er logget ind.\n\nMed venlig hilsen\n${s.club_name}`,
    });
    if (ok) {
      await run(db, "UPDATE members SET pin_hash = ?, updated_at = datetime('now'), updated_by = 'glemt pinkode' WHERE id = ?", await hashPin(pin), m.id);
      await logEvent(c, 'Ny pinkode sendt pr. mail (glemt pinkode)', m);
    } else {
      await logEvent(c, 'Glemt pinkode: mailen kunne ikke sendes', m);
    }
  }
  // Same answer whether or not a member matched, so the form can't be used to look people up.
  return render(c, 'lost', { sent: true, error: null });
});

r.get('/vejledning', (c) => render(c, 'help'));

export default r;
