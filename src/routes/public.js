import { Hono } from 'hono';
import { all, first, run, logEvent } from '../db.js';
import { verifyPin, hashPin, randomPin, throttle } from '../security.js';
import { sendEmail, sendSms } from '../notify.js';
import { isValidIsoDate } from '../dates.js';
import { render } from '../views/layout.js';
import { login, logout, flash } from '../session.js';

const PAGES = {
  '/om-klubben': ['Om klubben', 'about_text'],
  '/kontakt': ['Kontakt', 'contact_text'],
  '/turnering': ['Turnering', 'tournament_text'],
  '/sponsorer': ['Sponsorer', 'sponsors_text'],
};
const FIFTEEN_MIN = 15 * 60 * 1000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  const { member_no = '', email = '', mobile = '' } = c.get('form');
  const t = throttle(db, `lost:${c.get('ip')}`, { max: 5, windowMs: 4 * FIFTEEN_MIN });
  if (await t.blocked()) return render(c, 'lost', { sent: false, error: 'For mange forsøg. Prøv igen senere.' });
  await t.fail();
  const digits = mobile.replace(/\D/g, '');
  let m;
  if (member_no.trim()) m = await first(db, 'SELECT * FROM members WHERE member_no = ? AND active = 1', parseInt(member_no, 10) || -1);
  else if (email.trim()) m = await first(db, 'SELECT * FROM members WHERE lower(email) = lower(?) AND active = 1', email.trim());
  else if (digits.length >= 8) {
    m = await first(db, "SELECT * FROM members WHERE active = 1 AND mobile <> '' AND replace(mobile, ' ', '') LIKE ?", `%${digits.slice(-8)}`);
  } else return render(c, 'lost', { sent: false, error: 'Udfyld ét af felterne.' });

  if (m && (m.email || m.mobile)) {
    const s = c.get('settings');
    const pin = randomPin(4);
    await run(db, "UPDATE members SET pin_hash = ?, updated_at = datetime('now'), updated_by = 'glemt pinkode' WHERE id = ?", await hashPin(pin), m.id);
    await sendEmail(c.env, {
      to: m.email,
      from: `${s.club_name} <${s.club_email}>`,
      subject: `${s.club_name} - Ny pinkode`,
      text: `Kære ${m.name}\n\nDin nye pinkode til banebookingen er: ${pin}\nDit medlemsnummer er: ${m.member_no}\n\nDu kan skifte pinkoden, når du er logget ind.\n\nMed venlig hilsen\n${s.club_name}`,
    });
    await sendSms(c.env, { to: m.mobile, from: s.sms_sender, message: `Din nye pinkode til ${s.club_name}: ${pin} (medlemsnr. ${m.member_no})` });
    await logEvent(c, 'Ny pinkode sendt (glemt pinkode)', m);
  }
  // Same answer whether or not a member matched, so the form can't be used to look people up.
  return render(c, 'lost', { sent: true, error: null });
});

const memberTypes = (db) => all(db, 'SELECT * FROM member_types ORDER BY sort, id');

r.get('/bliv-medlem', async (c) => render(c, 'join', { types: await memberTypes(c.get('db')), values: {}, error: null, done: false }));

r.post('/bliv-medlem', async (c) => {
  const db = c.get('db');
  const types = await memberTypes(db);
  const f = c.get('form');
  const x = Object.fromEntries(
    ['name', 'address', 'postcode', 'city', 'email', 'phone', 'mobile', 'birthdate', 'member_type'].map((k) => [k, String(f[k] || '').trim()])
  );
  let error = null;
  if (!x.name || !x.address || !x.postcode || !x.city || !x.email) error = 'Udfyld alle felter markeret med *.';
  else if (!EMAIL_RE.test(x.email)) error = 'E-mailadressen ser ikke rigtig ud.';
  else if (x.birthdate && !isValidIsoDate(x.birthdate)) error = 'Fødselsdatoen er ugyldig.';
  else if (!types.some((t) => t.name === x.member_type)) error = 'Vælg en medlemstype.';
  if (error) return render(c, 'join', { types, values: x, error, done: false }, 400);

  await run(
    db,
    `INSERT INTO applications (name, address, postcode, city, email, phone, mobile, birthdate, member_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    x.name, x.address, x.postcode, x.city, x.email, x.phone, x.mobile, x.birthdate, x.member_type
  );
  await logEvent(c, `Indmeldelse modtaget: ${x.name}`);

  const s = c.get('settings');
  const type = types.find((t) => t.name === x.member_type);
  await sendEmail(c.env, {
    to: s.club_email,
    from: `${s.club_name} <${s.club_email}>`,
    subject: `${s.club_name} - Ny indmeldelse`,
    text: `${x.name} (${x.member_type}) har meldt sig ind via hjemmesiden.\n\nAktivér medlemskabet under Administration > Indmeldelser, når kontingentet er modtaget.`,
  });
  await sendEmail(c.env, {
    to: x.email,
    from: `${s.club_name} <${s.club_email}>`,
    subject: `${s.club_name} - Indmeldelse modtaget`,
    text: `Kære ${x.name}\n\nTak for din indmeldelse i ${s.club_name}. Dit medlemskab er gyldigt, når kontingentet (${type.price} kr.) er betalt.\n\n${s.payment_text}\n\nNår betalingen er modtaget, sender vi dit medlemsnummer og din pinkode.\n\nMed venlig hilsen\n${s.club_name}`,
  });
  return render(c, 'join', { types, values: {}, error: null, done: true });
});

for (const [url, [title, textKey]] of Object.entries(PAGES)) {
  r.get(url, (c) => render(c, 'page', { title, textKey }));
}
r.get('/vejledning', (c) => render(c, 'help'));

export default r;
