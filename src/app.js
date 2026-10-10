import { Hono } from 'hono';
import { getSettings, ensureAdmin } from './db.js';
import { sessionMiddleware, csrfCheck } from './session.js';
import { render } from './views/layout.js';
import publicRoutes from './routes/public.js';
import bookingRoutes from './routes/bookings.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';

const app = new Hono();

app.use(async (c, next) => {
  const db = c.env.DB;
  c.set('db', db);
  c.set('ip', c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '');
  await ensureAdmin(db, c.env);
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Referrer-Policy', 'same-origin');
});
app.use(sessionMiddleware);
app.use(async (c, next) => {
  c.set('settings', await getSettings(c.get('db')));
  await next();
});
app.use(csrfCheck);

app.route('/', publicRoutes);
app.route('/', bookingRoutes);
app.route('/', profileRoutes);
app.route('/admin', adminRoutes);

app.notFound((c) => render(c, 'message', { title: 'Siden findes ikke', text: 'Siden du leder efter findes ikke.' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.html('<h1>Der skete en fejl</h1><p>Prøv igen om lidt. Fortsætter fejlen, så kontakt klubben.</p><p><a href="/">Til forsiden</a></p>', 500);
});

export default app;
