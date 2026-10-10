// Date helpers. Dates are 'YYYY-MM-DD' strings in the club's time zone. Calendar math is done in UTC so the
// result never depends on the server's own time zone (Workers always run in UTC).

export const TIME_ZONE = 'Europe/Copenhagen';
export const DAY_NAMES = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

const pad = (n) => String(n).padStart(2, '0');

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

// Local club time as 'YYYY-MM-DD HH:MM:SS'.
export function localNow(date = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
export const today = () => localNow().slice(0, 10);
export const nowTime = () => localNow().slice(11, 16);

export function toIso(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function fromIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function addDays(iso, n) {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

// ISO-8601 week number and week-year.
export function isoWeek(iso) {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const week = 1 + Math.floor((d - Date.UTC(year, 0, 1)) / 86400000 / 7);
  return { year, week };
}
export const weeksInYear = (year) => isoWeek(`${year}-12-28`).week;
export function mondayOf(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  jan4.setUTCDate(4 - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
  return toIso(jan4);
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}
export const dayName = (iso) => DAY_NAMES[(fromIso(iso).getUTCDay() + 6) % 7];
export function isValidIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && toIso(fromIso(s)) === s;
}
