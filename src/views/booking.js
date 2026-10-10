import { html, csrfField, sel, errorBox, dates } from './helpers.js';

function deleteForm(p, b, back, label, cls = 'icon danger') {
  return html`<form method="post" action="/booking/${b.id}/slet" data-confirm="${label}">
    ${csrfField(p)}
    <input type="hidden" name="back" value="${back}">
    <button class="${cls}" title="Slet reservationen" aria-label="Slet">${cls.startsWith('icon') ? '✕' : 'Slet'}</button>
  </form>`;
}

export function booking(p) {
  const { courts, court, year, week, days, slots, grid, prev, next, current, lastDay, member, isPast, canEdit, canDelete } = p;
  const today = dates.today();
  const back = `/booking?bane=${court.id}&aar=${year}&uge=${week}`;
  const closed = (day) => lastDay && day > lastDay && !member.is_admin;
  const years = [current.year - 1, current.year, current.year + 1];

  const cell = (day, s) => {
    const b = grid[`${day}|${s.start_time}`];
    const past = isPast(day, s.start_time);
    if (b) {
      const mine = b.member_id === member.id || b.partner_id === member.id;
      return html`<td class="cell booked${mine ? ' mine' : ''}${past ? ' past' : ''}">
        <span class="who-line"><strong>${b.m_no}</strong> <span class="nm">${b.m_name}</span></span>
        <span class="who-line">${b.p_no ?? '–'} <span class="nm">${b.p_name || ''}</span></span>
        ${past ? '' : html`<span class="actions">
          ${canEdit(member, b) ? html`<a class="icon" href="/booking/${b.id}/ret" title="Ret reservationen" aria-label="Ret">✎</a>` : ''}
          ${canDelete(member, b) ? deleteForm(p, b, back, `Slet reservationen ${dates.dayName(day).toLowerCase()} kl. ${s.start_time}?`) : ''}
        </span>`}
      </td>`;
    }
    if (past || closed(day)) return html`<td class="cell past"></td>`;
    const label = `Book ${dates.dayName(day).toLowerCase()} kl. ${s.start_time}`;
    return html`<td class="cell free"><a href="/booking/ny?bane=${court.id}&dato=${day}&tid=${s.start_time}" title="${label}" aria-label="${label}">+</a></td>`;
  };

  const phoneSlot = (day, s) => {
    const b = grid[`${day}|${s.start_time}`];
    const past = isPast(day, s.start_time);
    if (past && !b) return '';
    const cls = b ? (b.member_id === member.id || b.partner_id === member.id ? ' mine' : ' booked') : '';
    return html`<div class="slot${cls}${past ? ' past' : ''}">
      <span class="t">${s.start_time}<span class="muted">–${s.end_time}</span></span>
      <span class="body">${b
        ? `${b.m_name} / ${b.p_name || '–'}`
        : closed(day)
          ? html`<span class="muted">Kan ikke bookes endnu</span>`
          : html`<a class="btn small" href="/booking/ny?bane=${court.id}&dato=${day}&tid=${s.start_time}">Book</a>`}</span>
      ${b && !past
        ? html`<span class="actions">
          ${canEdit(member, b) ? html`<a class="icon" href="/booking/${b.id}/ret" aria-label="Ret">✎</a>` : ''}
          ${canDelete(member, b) ? deleteForm(p, b, back, `Slet reservationen ${dates.dayName(day).toLowerCase()} kl. ${s.start_time}?`) : ''}
        </span>`
        : ''}
    </div>`;
  };

  return {
    title: 'Book bane',
    body: html`<div class="booking-head">
  <h1>Uge ${week} · ${year}</h1>
  <form method="get" action="/booking" class="week-form">
    <div class="tabs" role="tablist">
      ${courts.map((c) => html`<a role="tab" class="tab" href="/booking?bane=${c.id}&aar=${year}&uge=${week}" aria-selected="${c.id === court.id ? 'true' : 'false'}">${c.name}</a>`)}
    </div>
    <input type="hidden" name="bane" value="${court.id}">
    <div class="weeknav">
      <a class="btn ghost" href="/booking?bane=${court.id}&aar=${prev.year}&uge=${prev.week}" aria-label="Forrige uge">&larr;</a>
      <select name="uge" aria-label="Uge" data-autosubmit>
        ${Array.from({ length: p.weeks }, (_, i) => html`<option value="${i + 1}"${sel(i + 1 === week)}>Uge ${i + 1}</option>`)}
      </select>
      <select name="aar" aria-label="År" data-autosubmit>
        ${years.map((y) => html`<option${sel(y === year)}>${y}</option>`)}
      </select>
      <a class="btn ghost" href="/booking?bane=${court.id}&aar=${next.year}&uge=${next.week}" aria-label="Næste uge">&rarr;</a>
      ${year !== current.year || week !== current.week ? html`<a class="btn ghost" href="/booking?bane=${court.id}">I dag</a>` : ''}
      <noscript><button class="btn">Vis</button></noscript>
    </div>
  </form>
</div>

<div class="grid-wrap">
<table class="grid">
  <thead>
    <tr>
      <th class="corner">${court.name}</th>
      ${days.map((day) => html`<th class="${day === today ? 'today' : ''}">${dates.dayName(day)}<br><span class="muted">${dates.formatDate(day).slice(0, 5)}</span></th>`)}
    </tr>
  </thead>
  <tbody>
    ${slots.length ? '' : html`<tr><td colspan="8" class="muted">Der er ikke sat tider op for denne bane.</td></tr>`}
    ${slots.map((s) => html`<tr>
      <th class="time">${s.start_time}<span class="muted">–${s.end_time}</span></th>
      ${days.map((day) => cell(day, s))}
    </tr>`)}
  </tbody>
</table>
</div>

<div class="daylist">
  ${days.filter((day) => day >= today).map((day) => html`<section class="day${day === today ? ' today' : ''}">
    <h2>${dates.dayName(day)} <span class="muted">${dates.formatDate(day).slice(0, 5)}</span></h2>
    ${slots.map((s) => phoneSlot(day, s))}
  </section>`)}
  ${days[6] < today ? html`<p class="muted">Ugen er overstået.</p>` : ''}
</div>
<p class="legend"><span class="sw free"></span> Ledig <span class="sw mine"></span> Din reservation <span class="sw booked"></span> Optaget</p>`,
  };
}

export function booking_form(p) {
  const { court, date, slot, booking: b, partners } = p;
  return {
    title: b ? 'Ret reservation' : 'Book bane',
    body: html`<div class="card narrow">
  <h1>${b ? 'Ret reservation' : 'Book bane'}</h1>
  <p class="big"><strong>${court.name}</strong> · ${dates.dayName(date)} d. ${dates.formatDate(date)} · kl. ${slot.start_time}–${slot.end_time}</p>
  ${b ? html`<p>Booket af ${b.m_no} · ${b.m_name}</p>` : ''}
  ${errorBox(p.error)}
  ${p.blocked
    ? html`<p><a class="btn ghost" href="${p.back}">Tilbage til oversigten</a> <a href="/mine-reservationer">Mine reservationer</a></p>`
    : html`<form method="post" action="${b ? `/booking/${b.id}/ret` : '/booking/ny'}" class="stack">
    ${csrfField(p)}
    ${b ? '' : html`<input type="hidden" name="bane" value="${court.id}">
      <input type="hidden" name="dato" value="${date}">
      <input type="hidden" name="tid" value="${slot.start_time}">`}
    <label>Hvem skal du spille med?
      <select name="partner" required>
        <option value="">Vælg makker</option>
        ${partners.map((x) => html`<option value="${x.id}"${sel(b && b.partner_id === x.id)}>${x.member_no} · ${x.name}</option>`)}
      </select>
    </label>
    <div class="row">
      <button class="btn">${b ? 'Gem' : 'Book'}</button>
      <a class="btn ghost" href="${p.back}">Annuller</a>
    </div>
  </form>`}
</div>`,
  };
}

export function mine(p) {
  const { list, counted, member, canEdit, canDelete } = p;
  return {
    title: 'Mine reservationer',
    body: html`<h1>Mine reservationer</h1>
<p class="muted">Du har ${counted} kommende reservation${counted === 1 ? '' : 'er'} efter i dag${member.max_bookings < 999 ? ` og må have ${member.max_bookings} ad gangen` : ''}.</p>
${list.length
  ? html`<div class="card">
<table class="table">
  <thead><tr><th>Dag</th><th>Tid</th><th>Bane</th><th>Spillere</th><th></th></tr></thead>
  <tbody>
  ${list.map((b) => html`<tr>
      <td>${dates.dayName(b.date)} ${dates.formatDate(b.date)}</td>
      <td>${b.start_time}–${b.end_time}</td>
      <td>${b.court_name}</td>
      <td>${b.m_name} / ${b.p_name || '–'}</td>
      <td class="actions-cell">
        ${canEdit(member, b) ? html`<a href="/booking/${b.id}/ret">Ret</a>` : ''}
        ${canDelete(member, b) ? deleteForm(p, b, '/mine-reservationer', 'Slet reservationen?', 'link danger') : ''}
      </td>
    </tr>`)}
  </tbody>
</table>
</div>`
  : html`<div class="card"><p>Du har ingen kommende reservationer. <a href="/booking">Book en bane</a>.</p></div>`}`,
  };
}
