// Small progressive enhancements; every page works without JavaScript.
document.addEventListener('submit', (e) => {
  const msg = e.target.dataset.confirm;
  if (msg && !window.confirm(msg)) e.preventDefault();
});

for (const el of document.querySelectorAll('[data-autosubmit]')) {
  el.addEventListener('change', () => el.form.submit());
}

const toggle = document.querySelector('.menu-toggle');
toggle?.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  toggle.setAttribute('aria-expanded', String(open));
});

for (const input of document.querySelectorAll('[data-filter]')) {
  const table = document.querySelector(input.dataset.filter);
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    for (const row of table.tBodies[0].rows) row.hidden = q && !row.textContent.toLowerCase().includes(q);
  });
}

for (const btn of document.querySelectorAll('[data-random-pin]')) {
  btn.addEventListener('click', () => {
    const pin = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b % 10).join('');
    btn.form.elements.pin.value = pin;
  });
}

// "Add to home screen" hint on the front page (phones only, not when already opened from the home screen).
const install = document.querySelector('.install');
if (install) {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let dismissed = false;
  try { dismissed = localStorage.getItem('install-dismissed') === '1'; } catch {}
  const phone = matchMedia('(max-width: 700px)').matches;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!standalone && !dismissed && phone) {
    if (ios) {
      install.querySelector('.install-ios').hidden = false;
      install.hidden = false;
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      const btn = install.querySelector('.install-btn');
      install.querySelector('.install-other').hidden = false;
      btn.hidden = false;
      install.hidden = false;
      btn.addEventListener('click', async () => {
        e.prompt();
        await e.userChoice;
        install.hidden = true;
      }, { once: true });
    });
  }
  install.querySelector('.install-close').addEventListener('click', () => {
    install.hidden = true;
    try { localStorage.setItem('install-dismissed', '1'); } catch {}
  });
}
