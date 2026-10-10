// E-mail goes through Resend (RESEND_API_KEY), SMS through CPSMS.dk (CPSMS_USERNAME + CPSMS_APIKEY).
// Without keys, messages are written to the Worker log so nothing is silently lost while testing.

export const outbox = []; // last messages, used by the tests

function remember(msg) {
  outbox.push(msg);
  if (outbox.length > 50) outbox.shift();
}

export async function sendEmail(env, { to, subject, text, from }) {
  if (!to) return false;
  remember({ kind: 'email', to, subject, text });
  if (!env.RESEND_API_KEY) {
    if (!env.QUIET) console.log(`[e-mail ikke sat op] til ${to}: ${subject}\n${text}`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || from, to: [to], subject, text }),
    });
    if (!res.ok) console.error('E-mail fejlede:', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('E-mail fejlede:', err.message);
    return false;
  }
}

export async function sendSms(env, { to, message, from }) {
  if (!to) return false;
  const digits = String(to).replace(/\D/g, '');
  const recipient = digits.length === 8 ? `45${digits}` : digits;
  remember({ kind: 'sms', to: recipient, message });
  if (!env.CPSMS_USERNAME || !env.CPSMS_APIKEY) {
    if (!env.QUIET) console.log(`[SMS ikke sat op] til ${recipient}: ${message}`);
    return false;
  }
  try {
    const res = await fetch('https://api.cpsms.dk/v2/send', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${env.CPSMS_USERNAME}:${env.CPSMS_APIKEY}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: recipient, message, from: (from || 'Tennis').slice(0, 11) }),
    });
    if (!res.ok) console.error('SMS fejlede:', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('SMS fejlede:', err.message);
    return false;
  }
}
