import { html, csrfField } from './helpers.js';
import * as pages from './pages.js';
import * as booking from './booking.js';
import * as admin from './admin.js';
import { getSettings } from '../db.js';

const VIEWS = { ...pages, ...booking, ...admin };

function nav(p) {
  const link = (href, label) => {
    const current = p.path === href || (href !== '/' && p.path.startsWith(href));
    return html`<a href="${href}" ${current ? html`aria-current="page"` : ''}>${label}</a>`;
  };
  const m = p.member;
  return html`<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="brand" href="/"><img src="/ball.svg" alt="" width="28" height="28"><span>${p.settings.club_name}</span></a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
    <nav id="nav" class="nav">
      ${link('/', 'Forside')}
      ${m ? [link('/booking', 'Book bane'), link('/mine-reservationer', 'Mine reservationer')] : ''}
      ${link('/bliv-medlem', 'Bliv medlem')}
      ${link('/om-klubben', 'Om klubben')}
      ${link('/kontakt', 'Kontakt')}
      ${m?.is_admin ? link('/admin', 'Administration') : ''}
    </nav>
    ${m
      ? html`<div class="who">
        <a href="/profil" title="Mine oplysninger">${m.member_no} · ${m.name}</a>
        <form method="post" action="/logout">${csrfField(p)}<button class="link">Log ud</button></form>
      </div>`
      : ''}
  </div>
</header>`;
}

function page(p, body) {
  const s = p.settings;
  return html`<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${p.title ? `${p.title} · ` : ''}${s.club_name}</title>
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" href="/ball.svg" type="image/svg+xml">
</head>
<body>
${nav(p)}
<main class="wrap">
${p.flash ? html`<div class="flash" role="status">${p.flash}</div>` : ''}
${body}
</main>
<footer class="footer">
  <div class="wrap">
    <strong>${s.club_name}</strong>
    ${s.club_address ? html` · ${s.club_address}` : ''}
    ${s.club_phone ? html` · Tlf. ${s.club_phone}` : ''}
    ${s.club_email ? html` · <a href="mailto:${s.club_email}">${s.club_email}</a>` : ''}
    <nav class="footer-links"><a href="/om-klubben">Om klubben</a> <a href="/turnering">Turnering</a> <a href="/sponsorer">Sponsorer</a> <a href="/kontakt">Kontakt</a> <a href="/vejledning">Vejledning</a></nav>
  </div>
</footer>
<script src="/app.js" defer></script>
</body>
</html>`;
}

// Renders a view inside the page layout. Views that return { bare } (the print page) skip the layout.
export async function render(c, name, props = {}, status = 200) {
  const p = {
    settings: c.get('settings') || (await getSettings(c.get('db'))),
    member: c.get('member'),
    csrf: c.get('csrf'),
    path: new URL(c.req.url).pathname,
    flash: c.get('flash'),
    ...props,
  };
  const view = VIEWS[name];
  const out = view(p);
  const doc = out && out.bare ? out.bare : page({ ...p, title: p.title ?? out.title }, out.body ?? out);
  return c.html(doc, status);
}
