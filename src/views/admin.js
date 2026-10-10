import { html, raw, csrfField, sel, chk, v, errorBox, dates } from './helpers.js';

const TABS = [
  ['/admin/medlemmer', 'Medlemmer'], ['/admin/indmeldelser', 'Indmeldelser'], ['/admin/baner', 'Baner og tider'],
  ['/admin/indstillinger', 'Indstillinger og tekster'], ['/admin/log', 'Log'],
];

const subnav = (p) => html`<nav class="subnav">
  ${TABS.map(([href, label]) => html`<a href="${href}" ${p.path.startsWith(href) ? html`aria-current="page"` : ''}>${label}${href === '/admin/indmeldelser' && p.pendingApplications ? html` <span class="badge">${p.pendingApplications}</span>` : ''}</a>`)}
</nav>`;

const postButton = (p, action, label, cls = 'link', confirm = '') =>
  html`<form method="post" action="${action}" ${confirm ? html`data-confirm="${confirm}"` : ''}>${csrfField(p)}<button class="${cls}">${label}</button></form>`;

export function admin_members(p) {
  const { active, inactive, member } = p;
  return {
    title: 'Medlemmer',
    body: html`${subnav(p)}
<div class="toolbar">
  <h1>Aktive medlemmer <span class="muted">(${active.length})</span></h1>
  <div class="row">
    <a class="btn" href="/admin/medlemmer/ny">Opret medlem</a>
    <a class="btn ghost" href="/admin/medlemmer/print" target="_blank">Udskriv medlemsliste</a>
    <a class="btn ghost" href="/admin/medlemmer.csv">Hent som CSV</a>
  </div>
</div>
<input class="filter" type="search" placeholder="Søg på navn, nummer, e-mail..." data-filter="#active-table">
<div class="card">
<table class="table" id="active-table">
  <thead><tr><th>Nr.</th><th>Navn</th><th>Telefon</th><th>E-mail</th><th>Type</th><th>Maks.</th><th></th></tr></thead>
  <tbody>
  ${active.map((m) => html`<tr>
      <td>${m.member_no}</td>
      <td><a href="/admin/medlemmer/${m.id}">${m.name}</a>${m.is_admin ? html` <span class="badge">admin</span>` : ''}</td>
      <td>${m.mobile || m.phone}</td>
      <td>${m.email ? html`<a href="mailto:${m.email}">${m.email}</a>` : ''}</td>
      <td>${m.member_type}</td>
      <td>${m.max_bookings >= 999 ? '∞' : m.max_bookings}</td>
      <td class="actions-cell">
        <a href="/admin/medlemmer/${m.id}">Ret</a>
        ${m.id !== member.id ? postButton(p, `/admin/medlemmer/${m.id}/deaktiver`, 'Deaktiver', 'link danger', `Deaktiver ${m.name}? Medlemmet kan ikke længere logge ind, og kommende reservationer slettes.`) : ''}
      </td>
    </tr>`)}
  </tbody>
</table>
</div>

<h2>Inaktive medlemmer <span class="muted">(${inactive.length})</span></h2>
<div class="card">
${inactive.length
  ? html`<table class="table">
  <thead><tr><th>Nr.</th><th>Navn</th><th>Telefon</th><th>E-mail</th><th></th></tr></thead>
  <tbody>
  ${inactive.map((m) => html`<tr>
      <td>${m.member_no}</td>
      <td><a href="/admin/medlemmer/${m.id}">${m.name}</a></td>
      <td>${m.mobile || m.phone}</td>
      <td>${m.email}</td>
      <td class="actions-cell">
        ${postButton(p, `/admin/medlemmer/${m.id}/aktiver`, 'Aktiver')}
        ${postButton(p, `/admin/medlemmer/${m.id}/slet`, 'Slet permanent', 'link danger', `Slet ${m.name} permanent? Det kan IKKE fortrydes, og medlemmets reservationer slettes også.`)}
      </td>
    </tr>`)}
  </tbody>
</table>`
  : html`<p class="muted">Ingen.</p>`}
</div>`,
  };
}

export function admin_members_print(p) {
  const { list, settings: s } = p;
  return {
    bare: html`<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <title>Medlemsliste · ${s.club_name}</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body class="print-page">
  <h1>Medlemsliste · ${s.club_name}</h1>
  <p class="muted">Udskrevet ${dates.formatDate(dates.today())} · ${list.length} aktive medlemmer</p>
  <table class="table print">
    <thead><tr><th>Nr.</th><th>Navn</th><th>Adresse</th><th>Telefon</th><th>E-mail</th><th>Fødselsdato</th><th>Type</th></tr></thead>
    <tbody>
    ${list.map((m) => html`<tr>
        <td>${m.member_no}</td><td>${m.name}</td>
        <td>${[m.address, [m.postcode, m.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</td>
        <td>${[m.phone, m.mobile].filter(Boolean).join(' / ')}</td><td>${m.email}</td>
        <td>${dates.formatDate(m.birthdate)}</td><td>${m.member_type}</td>
      </tr>`)}
    </tbody>
  </table>
  <script src="/print.js"></script>
</body>
</html>`,
  };
}

export function admin_member_form(p) {
  const { values: x, isNew, types, limits } = p;
  return {
    title: isNew ? 'Opret medlem' : 'Ret medlem',
    body: html`${subnav(p)}
<div class="card narrow">
  <h1>${isNew ? 'Opret medlem' : `Ret ${x.name}`}</h1>
  ${isNew ? '' : html`<p class="muted small">Oprettet ${dates.formatDate(x.created_at)}${x.updated_at ? ` · sidst rettet ${dates.formatDate(x.updated_at)} af ${x.updated_by}` : ''}${x.active ? '' : ' · INAKTIV'}</p>`}
  ${errorBox(p.error)}
  <form method="post" class="stack">
    ${csrfField(p)}
    <input type="hidden" name="application_id" value="${v(p.applicationId)}">
    <div class="row">
      <label class="w-30">Medlemsnr. <input name="member_no" value="${v(x.member_no)}" inputmode="numeric" required></label>
      <label>Navn <input name="name" value="${v(x.name)}" required></label>
    </div>
    <label>Adresse <input name="address" value="${v(x.address)}"></label>
    <div class="row">
      <label class="w-30">Postnr. <input name="postcode" value="${v(x.postcode)}"></label>
      <label>By <input name="city" value="${v(x.city)}"></label>
    </div>
    <label>E-mail <input name="email" type="email" value="${v(x.email)}"></label>
    <div class="row">
      <label>Telefon <input name="phone" value="${v(x.phone)}"></label>
      <label>Mobil <input name="mobile" value="${v(x.mobile)}"></label>
    </div>
    <div class="row">
      <label>Fødselsdato <input name="birthdate" type="date" value="${v(x.birthdate)}"></label>
      <label>Medlemstype
        <select name="member_type">
          <option value=""></option>
          ${types.map((t) => html`<option${sel(x.member_type === t.name)}>${t.name}</option>`)}
          ${x.member_type && !types.some((t) => t.name === x.member_type) ? html`<option selected>${x.member_type}</option>` : ''}
        </select>
      </label>
    </div>
    <div class="row">
      <label>Rettigheder
        <select name="is_admin">
          <option value="0">Almindelig bruger</option>
          <option value="1"${sel(x.is_admin)}>Administrator</option>
        </select>
      </label>
      <label>Maks. kommende reservationer
        <select name="max_bookings">
          ${limits.map((l) => html`<option value="${l}"${sel(Number(x.max_bookings) === l)}>${l >= 999 ? 'Ubegrænset' : l}</option>`)}
        </select>
      </label>
    </div>
    <fieldset>
      <legend>${isNew ? 'Pinkode' : 'Ny pinkode (lad stå tom for at beholde den nuværende)'}</legend>
      <div class="row">
        <label class="w-30">Pinkode <input name="pin" value="${v(x.pin)}" inputmode="numeric" pattern="${raw('\\d{4,8}')}"${isNew ? raw(' required') : ''}></label>
        ${isNew ? '' : html`<button type="button" class="btn ghost" data-random-pin>Lav tilfældig</button>`}
      </div>
      <label class="check"><input type="checkbox" name="send_email" value="1"${chk(isNew)}> Send login pr. e-mail</label>
      <label class="check"><input type="checkbox" name="send_sms" value="1"> Send login pr. SMS</label>
    </fieldset>
    <div class="row">
      <button class="btn">${isNew ? 'Opret' : 'Gem'}</button>
      <a class="btn ghost" href="/admin/medlemmer">Annuller</a>
    </div>
  </form>
</div>`,
  };
}

export function admin_applications(p) {
  const { pending, done } = p;
  return {
    title: 'Indmeldelser',
    body: html`${subnav(p)}
<h1>Indmeldelser der venter</h1>
<p class="muted">Opret medlemmet, når kontingentet er betalt. Felterne bliver udfyldt fra indmeldelsen.</p>
<div class="card">
${pending.length
  ? html`<table class="table">
  <thead><tr><th>Modtaget</th><th>Navn</th><th>Type</th><th>Kontakt</th><th></th></tr></thead>
  <tbody>
  ${pending.map((a) => html`<tr>
      <td>${dates.formatDate(a.created_at)}</td>
      <td>${a.name}<br><span class="muted small">${a.address}, ${a.postcode} ${a.city}</span></td>
      <td>${a.member_type}</td>
      <td><a href="mailto:${a.email}">${a.email}</a><br><span class="small">${[a.phone, a.mobile].filter(Boolean).join(' / ')}</span></td>
      <td class="actions-cell">
        <a class="btn small" href="/admin/medlemmer/ny?indmeldelse=${a.id}">Opret medlem</a>
        ${postButton(p, `/admin/indmeldelser/${a.id}/afslut`, 'Afvis', 'link danger', `Afslut indmeldelsen fra ${a.name} uden at oprette et medlem?`)}
      </td>
    </tr>`)}
  </tbody>
</table>`
  : html`<p class="muted">Ingen ventende indmeldelser.</p>`}
</div>
<h2>Afsluttede</h2>
<div class="card">
${done.length
  ? html`<table class="table">
  <thead><tr><th>Modtaget</th><th>Navn</th><th>Type</th><th>Resultat</th></tr></thead>
  <tbody>
  ${done.map((a) => html`<tr><td>${dates.formatDate(a.created_at)}</td><td>${a.name}</td><td>${a.member_type}</td><td>${a.member_no ? `Oprettet som nr. ${a.member_no}` : 'Afvist'}</td></tr>`)}
  </tbody>
</table>`
  : html`<p class="muted">Ingen endnu.</p>`}
</div>`,
  };
}

export function admin_courts(p) {
  return {
    title: 'Baner og tider',
    body: html`${subnav(p)}
<h1>Baner og tider</h1>
<p class="muted">Skriv ét tidsrum pr. linje, fx <code>08:00-09:30</code>. Eksisterende reservationer bliver ikke ændret, men vises kun i oversigten, hvis deres starttid stadig findes.</p>
${errorBox(p.error)}
<form method="post">
  ${csrfField(p)}
  <div class="cols">
  ${p.courts.map((c) => html`<section class="card stack">
      <label>Navn <input name="name_${c.id}" value="${c.name}"></label>
      <div class="row">
        <label class="w-30">Rækkefølge <input name="sort_${c.id}" value="${c.sort}" inputmode="numeric"></label>
        <label class="check"><input type="checkbox" name="active_${c.id}" value="1"${chk(c.active)}> Kan bookes</label>
      </div>
      <label>Tider <textarea name="slots_${c.id}" rows="16">${c.slotText}</textarea></label>
    </section>`)}
    <section class="card stack">
      <h3>Tilføj bane</h3>
      <label>Navn <input name="new_name" placeholder="fx Bane 3"></label>
      <label>Tider <textarea name="new_slots" rows="10" placeholder="08:00-09:00&#10;09:00-10:00"></textarea></label>
    </section>
  </div>
  <button class="btn">Gem baner og tider</button>
</form>`,
  };
}

const TEXT_LABELS = {
  front_text: 'Forside: velkomst', missing_login_text: 'Forside: mangler login', join_text: 'Bliv medlem: forklaring',
  payment_text: 'E-mail til nye medlemmer: sådan betaler du', about_text: 'Om klubben', contact_text: 'Kontakt',
  tournament_text: 'Turnering', sponsors_text: 'Sponsorer',
};

export function admin_settings(p) {
  const { settings: s, types } = p;
  return {
    title: 'Indstillinger',
    body: html`${subnav(p)}
<h1>Indstillinger og tekster</h1>
<form method="post" class="stack">
  ${csrfField(p)}
  <div class="cols two">
    <section class="card stack">
      <h2>Klubben</h2>
      <label>Klubbens navn <input name="club_name" value="${s.club_name}" required></label>
      <label>E-mail (modtager indmeldelser) <input name="club_email" type="email" value="${s.club_email}"></label>
      <label>Telefon <input name="club_phone" value="${s.club_phone}"></label>
      <label>Adresse <input name="club_address" value="${s.club_address}"></label>
      <label>SMS-afsender (højst 11 tegn) <input name="sms_sender" maxlength="11" value="${s.sms_sender}"></label>
      <label>Hvor mange dage frem må medlemmer booke? (0 = ingen grænse) <input name="booking_days_ahead" inputmode="numeric" value="${s.booking_days_ahead}"></label>
    </section>
    <section class="card stack">
      <h2>Medlemstyper og kontingent</h2>
      <table class="table compact">
        <thead><tr><th>Navn</th><th>Beskrivelse</th><th>Kr.</th><th>Orden</th><th>Slet</th></tr></thead>
        <tbody>
        ${types.map((t) => html`<tr>
            <td><input name="type_name_${t.id}" value="${t.name}"></td>
            <td><input name="type_desc_${t.id}" value="${t.description}"></td>
            <td><input name="type_price_${t.id}" value="${t.price}" inputmode="numeric" size="5"></td>
            <td><input name="type_sort_${t.id}" value="${t.sort}" inputmode="numeric" size="2"></td>
            <td><input type="checkbox" name="type_delete_${t.id}" value="1" aria-label="Slet ${t.name}"></td>
          </tr>`)}
          <tr>
            <td><input name="type_name_new" placeholder="Ny type"></td>
            <td><input name="type_desc_new"></td>
            <td><input name="type_price_new" inputmode="numeric" size="5"></td>
            <td></td><td></td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
  <section class="card stack">
    <h2>Tekster på siden</h2>
    <p class="muted small">En tom linje starter et nyt afsnit.</p>
    ${Object.entries(TEXT_LABELS).map(([k, label]) => html`<label>${label} <textarea name="${k}" rows="5">${s[k]}</textarea></label>`)}
  </section>
  <button class="btn">Gem indstillinger</button>
</form>`,
  };
}

export function admin_log(p) {
  return {
    title: 'Log',
    body: html`${subnav(p)}
<h1>Log <span class="muted">· de seneste 500 handlinger</span></h1>
<div class="card">
<table class="table">
  <thead><tr><th>Tidspunkt</th><th>Hændelse</th><th>Bruger</th><th>IP</th></tr></thead>
  <tbody>
  ${p.list.map((l) => html`<tr><td class="nowrap">${dates.formatDate(l.at)} ${l.at.slice(11, 16)}</td><td>${l.event}</td><td>${l.user}</td><td>${l.ip}</td></tr>`)}
  </tbody>
</table>
</div>`,
  };
}
