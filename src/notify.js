// E-mail goes through Brevo (BREVO_API_KEY) or Resend (RESEND_API_KEY). The sender is MAIL_FROM, or else the
// club name and e-mail from Administration > Indstillinger; with Brevo that address must be a verified sender.
// Without a key, messages are written to the Worker log and sendEmail returns false.

export const outbox = []; // last messages, used by the tests

function remember(msg) {
  outbox.push(msg);
  if (outbox.length > 50) outbox.shift();
}

export const mailConfigured = (env) => Boolean(env.BREVO_API_KEY || env.RESEND_API_KEY || env.MAIL_TEST);

// "Tvis Tennis <info@example.dk>" -> { name, email }
function parseAddress(s) {
  const m = String(s || '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].replace(/^"|"$/g, ''), email: m[2].trim() } : { name: '', email: String(s || '').trim() };
}

export async function sendEmail(env, { to, subject, text, from }) {
  if (!to) return false;
  remember({ to, subject, text });
  if (env.MAIL_TEST) return true;
  const sender = env.MAIL_FROM || from;
  let req;
  if (env.BREVO_API_KEY) {
    const { name, email } = parseAddress(sender);
    req = fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: name ? { name, email } : { email }, to: [{ email: to }], subject, textContent: text }),
    });
  } else if (env.RESEND_API_KEY) {
    req = fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: sender, to: [to], subject, text }),
    });
  } else {
    if (!env.QUIET) console.log(`[e-mail ikke sat op] til ${to}: ${subject}\n${text}`);
    return false;
  }
  try {
    const res = await req;
    if (!res.ok) console.error('E-mail fejlede:', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('E-mail fejlede:', err.message);
    return false;
  }
}
