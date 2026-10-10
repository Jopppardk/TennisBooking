import { html, paragraphs, csrfField, v, errorBox } from './helpers.js';

const paras = (text) => paragraphs(text).map((p) => html`<p>${p}</p>`);

export function index(p) {
  const { settings: s, member: m } = p;
  return {
    title: '',
    bodyClass: 'home',
    body: html`<section class="court">
  <div class="court-lines" aria-hidden="true"></div>
  <div class="card login-card">
    <img class="login-ball" src="/ball.svg" alt="" width="44" height="44">
    <p class="kicker">${s.club_name}</p>
    ${m
      ? html`<h1>Hej ${m.name.split(' ')[0]}</h1>
      <p class="muted">Du er logget ind som medlem nr. ${m.member_no}.</p>
      <a class="btn block" href="/booking">Book en bane</a>
      <p class="login-links"><a href="/mine-reservationer">Mine reservationer</a> · <a href="/profil">Mine oplysninger</a></p>`
      : html`<h1>Booking af bane</h1>
      <form method="post" action="/login" class="stack">
        ${csrfField(p)}
        <label>Medlemsnummer <input name="member_no" inputmode="numeric" autocomplete="username" required autofocus></label>
        <label>Pinkode <input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required></label>
        <button class="btn block">Log ind</button>
      </form>
      <p class="login-links"><a href="/glemt-pinkode">Glemt pinkode?</a> · <a href="/vejledning">Sådan booker du</a></p>`}
  </div>
</section>
<div class="install" hidden>
  <img src="/icon-192.png" alt="" width="44" height="44">
  <div>
    <strong>Læg banebookingen på din hjemmeskærm</strong>
    <p class="install-ios" hidden>Tryk på <span class="share" aria-label="Del">Del</span> nederst i Safari og vælg <strong>Føj til hjemmeskærm</strong>.</p>
    <p class="install-other" hidden>Så åbner den som en app med tennisbolden som ikon.</p>
  </div>
  <button type="button" class="btn small install-btn" hidden>Tilføj</button>
  <button type="button" class="install-close" aria-label="Luk">✕</button>
</div>
<div class="cols two home-info">
  ${paragraphs(s.front_text).length ? html`<section class="card">${paras(s.front_text)}</section>` : ''}
  ${m ? '' : html`<section class="card">
    <h3>Mangler du login?</h3>
    ${paras(s.missing_login_text)}
    ${s.club_email ? html`<p><a href="mailto:${s.club_email}">${s.club_email}</a>${s.club_phone ? html` · ${s.club_phone}` : ''}</p>` : ''}
  </section>`}
</div>`,
  };
}

export function message(p) {
  return {
    title: p.title,
    body: html`<div class="card narrow"><h1>${p.title}</h1><p>${p.text}</p><p><a href="/">Til forsiden</a></p></div>`,
  };
}

export function lost(p) {
  const s = p.settings;
  return {
    title: 'Glemt pinkode',
    body: html`<div class="card narrow">
  <h1>Glemt pinkode</h1>
  ${p.sent
    ? html`<p>Hvis vi fandt dig i medlemslisten, har vi sendt en ny pinkode til din e-mail. Kig også i spam-mappen.</p>
    <p>Får du ikke noget, så kontakt klubben${s.club_email ? html` på <a href="mailto:${s.club_email}">${s.club_email}</a>` : ''}.</p>
    <p><a href="/">Tilbage til login</a></p>`
    : html`<p>Skriv dit medlemsnummer eller din e-mail, så sender vi en ny pinkode til den e-mail, vi har på dig.</p>
    ${errorBox(p.error)}
    <form method="post" class="stack">
      ${csrfField(p)}
      <label>Medlemsnummer <input name="member_no" inputmode="numeric"></label>
      <label>E-mail <input name="email" type="email"></label>
      <button class="btn">Send ny pinkode</button>
    </form>`}
</div>`,
  };
}

export function help(p) {
  const s = p.settings;
  return {
    title: 'Vejledning',
    body: html`<div class="card narrow">
  <h1>Vejledning</h1>
  <h2>1. Log ind</h2>
  <p>Skriv dit medlemsnummer og din pinkode på forsiden og tryk "Log ind". Har du ikke fået en pinkode, så kontakt klubben. Har du glemt den, kan du få en ny under <a href="/glemt-pinkode">Glemt pinkode</a>.</p>
  <p>Når du er logget ind, kan du rette dine oplysninger og skifte pinkode ved at klikke på dit navn øverst. Sørg for at din e-mail er rigtig, så vi kan sende dig en ny pinkode, hvis du mister den.</p>
  <h2>2. Book en bane</h2>
  <p>Vælg "Book bane", vælg banen og ugen. Ledige tider har et <span class="plus-demo">+</span>. Tryk på det, vælg hvem du skal spille med, og tryk "Book". Både dit og din makkers navn står nu i oversigten.</p>
  <h2>3. Ret eller slet en reservation</h2>
  <p>Under din reservation er der knapper til at rette og slette. Du kan kun rette, hvem du spiller med. Sletter du tiden, bliver den ledig for andre. Din makker kan også slette reservationen.</p>
  <p>Der er en grænse for, hvor mange kommende reservationer du kan have på én gang (normalt én). På dagen hvor du spiller, tæller reservationen ikke længere med, så du kan booke din næste tid.</p>
  <h2>4. Spørgsmål</h2>
  <p>Kontakt klubben${s.club_email ? html` på <a href="mailto:${s.club_email}">${s.club_email}</a>` : ''}${s.club_phone ? html` eller på tlf. ${s.club_phone}` : ''}.</p>
</div>`,
  };
}

export function profile(p) {
  const { member: m, values: x } = p;
  return {
    title: 'Mine oplysninger',
    body: html`<div class="card narrow">
  <h1>Mine oplysninger</h1>
  <p class="muted">Medlemsnummer ${m.member_no}${m.member_type ? html` · ${m.member_type}` : ''}. <a href="/skift-pinkode">Skift pinkode</a></p>
  ${errorBox(p.error)}
  <form method="post" class="stack">
    ${csrfField(p)}
    <label>Navn <input name="name" value="${v(x.name)}" required></label>
    <label>Adresse <input name="address" value="${v(x.address)}"></label>
    <div class="row">
      <label class="w-30">Postnr. <input name="postcode" value="${v(x.postcode)}"></label>
      <label>By <input name="city" value="${v(x.city)}"></label>
    </div>
    <label>E-mail <input name="email" type="email" value="${v(x.email)}"></label>
    <div class="row">
      <label>Telefon <input name="phone" value="${v(x.phone)}" inputmode="tel"></label>
      <label>Mobil <input name="mobile" value="${v(x.mobile)}" inputmode="tel"></label>
    </div>
    <p class="small muted">Din e-mail bruges til at sende dig en ny pinkode, hvis du glemmer den.</p>
    <button class="btn">Gem</button>
  </form>
</div>`,
  };
}

export function pin(p) {
  return {
    title: 'Skift pinkode',
    body: html`<div class="card narrow">
  <h1>Skift pinkode</h1>
  ${errorBox(p.error)}
  <form method="post" class="stack">
    ${csrfField(p)}
    <label>Nuværende pinkode <input name="current" type="password" inputmode="numeric" autocomplete="current-password" required></label>
    <label>Ny pinkode (4-8 cifre) <input name="pin" type="password" inputmode="numeric" autocomplete="new-password" pattern="\\d{4,8}" required></label>
    <label>Gentag ny pinkode <input name="pin2" type="password" inputmode="numeric" autocomplete="new-password" pattern="\\d{4,8}" required></label>
    <button class="btn">Skift pinkode</button>
  </form>
</div>`,
  };
}
