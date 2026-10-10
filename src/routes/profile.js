import { Hono } from 'hono';
import { run, logEvent } from '../db.js';
import { requireLogin, flash } from '../session.js';
import { hashPin, verifyPin, isValidPin } from '../security.js';
import { render } from '../views/layout.js';

const r = new Hono();
r.use('/profil', requireLogin);
r.use('/skift-pinkode', requireLogin);

r.get('/profil', (c) => render(c, 'profile', { values: c.get('member'), error: null }));

r.post('/profil', async (c) => {
  const me = c.get('member');
  const f = c.get('form');
  const x = Object.fromEntries(['name', 'address', 'postcode', 'city', 'email', 'phone', 'mobile'].map((k) => [k, String(f[k] || '').trim()]));
  let error = null;
  if (!x.name) error = 'Navn skal udfyldes.';
  else if (x.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email)) error = 'E-mailadressen ser ikke rigtig ud.';
  if (error) return render(c, 'profile', { values: { ...me, ...x }, error }, 400);
  await run(
    c.get('db'),
    `UPDATE members SET name=?, address=?, postcode=?, city=?, email=?, phone=?, mobile=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    x.name, x.address, x.postcode, x.city, x.email, x.phone, x.mobile, me.name, me.id
  );
  await logEvent(c, 'Opdaterede egne oplysninger');
  flash(c, 'Dine oplysninger er gemt.');
  return c.redirect('/profil');
});

r.get('/skift-pinkode', (c) => render(c, 'pin', { error: null }));

r.post('/skift-pinkode', async (c) => {
  const me = c.get('member');
  const { current = '', pin = '', pin2 = '' } = c.get('form');
  let error = null;
  if (!(await verifyPin(current, me.pin_hash))) error = 'Den nuværende pinkode er forkert.';
  else if (!isValidPin(pin)) error = 'Den nye pinkode skal være 4 til 8 cifre.';
  else if (pin !== pin2) error = 'De to nye pinkoder er ikke ens.';
  if (error) return render(c, 'pin', { error }, 400);
  const db = c.get('db');
  await run(db, "UPDATE members SET pin_hash = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?", await hashPin(pin), me.name, me.id);
  // Sign out other devices, keep this one.
  await run(db, 'DELETE FROM sessions WHERE member_id = ? AND token <> ?', me.id, c.get('sessionToken'));
  await logEvent(c, 'Skiftede pinkode');
  flash(c, 'Din pinkode er skiftet.');
  return c.redirect('/profil');
});

export default r;
