import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomToken, safeEqual } from './security.js';
import { first, run } from './db.js';
import { render } from './views/layout.js';

const MAX_AGE = 30 * 24 * 60 * 60; // seconds

function cookieOptions(c) {
  return { httpOnly: true, sameSite: 'Lax', secure: new URL(c.req.url).protocol === 'https:', path: '/' };
}

export async function sessionMiddleware(c, next) {
  const db = c.get('db');
  const token = getCookie(c, 'sid');
  const row = token
    ? await first(
        db,
        `SELECT s.token, s.csrf, m.* FROM sessions s JOIN members m ON m.id = s.member_id
         WHERE s.token = ? AND s.expires_at > ? AND m.active = 1`,
        token, Date.now()
      )
    : null;
  if (row) {
    const { token: t, csrf, ...member } = row;
    c.set('member', member);
    c.set('sessionToken', t);
    c.set('csrf', csrf);
  } else {
    // Visitors get a CSRF token in its own cookie, for the login and public forms.
    let csrf = getCookie(c, 'acsrf');
    if (!csrf) {
      csrf = randomToken();
      setCookie(c, 'acsrf', csrf, cookieOptions(c));
    }
    c.set('csrf', csrf);
  }
  const flash = getCookie(c, 'flash');
  c.set('flash', flash || null);
  if (flash) deleteCookie(c, 'flash', { path: '/' });
  await next();
}

export function flash(c, msg) {
  setCookie(c, 'flash', msg, { ...cookieOptions(c), maxAge: 60 });
}

export async function login(c, memberId) {
  const db = c.get('db');
  const token = randomToken();
  await run(db, 'INSERT INTO sessions (token, member_id, csrf, expires_at) VALUES (?, ?, ?, ?)', token, memberId, randomToken(), Date.now() + MAX_AGE * 1000);
  await run(db, 'DELETE FROM sessions WHERE expires_at < ?', Date.now());
  setCookie(c, 'sid', token, { ...cookieOptions(c), maxAge: MAX_AGE });
}

export async function logout(c) {
  const token = c.get('sessionToken');
  if (token) await run(c.get('db'), 'DELETE FROM sessions WHERE token = ?', token);
  deleteCookie(c, 'sid', { path: '/' });
}

// Parses the form once and checks the CSRF token on every POST.
export async function csrfCheck(c, next) {
  if (c.req.method !== 'POST') return next();
  const body = await c.req.parseBody();
  const form = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  c.set('form', form);
  if (!safeEqual(form._csrf || '', c.get('csrf'))) {
    return render(c, 'message', { title: 'Formularen er udløbet', text: 'Gå tilbage, genindlæs siden og prøv igen.' }, 403);
  }
  await next();
}

export async function requireLogin(c, next) {
  if (c.get('member')) return next();
  flash(c, 'Du skal logge ind for at se den side.');
  return c.redirect('/');
}

export async function requireAdmin(c, next) {
  const m = c.get('member');
  if (m?.is_admin) return next();
  if (!m) return requireLogin(c, next);
  return render(c, 'message', { title: 'Ingen adgang', text: 'Du har ikke rettigheder til denne side.' }, 403);
}
