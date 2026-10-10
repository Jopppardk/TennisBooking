# Tennis court booking

Booking site for a tennis club: members, court bookings, sign-ups and administration. It rebuilds the old PHP site
(Tvis IF Tennis / ambabooking.dk) with the same functions. The site itself is in Danish.

**Stack:** [Cloudflare Workers](https://developers.cloudflare.com/workers/) running [Hono](https://hono.dev),
a [D1](https://developers.cloudflare.com/d1/) (SQLite) database, server-rendered HTML and plain CSS.
No build step. It fits within Cloudflare's free plan for a club-sized site.

## Publish on Cloudflare (first time)

You need a free Cloudflare account and Node.js 22.

```bash
npm install
npx wrangler login                       # opens the browser to sign in to Cloudflare
npx wrangler d1 create tennis-booking    # prints a database_id
```

Paste the `database_id` into `wrangler.toml`, then:

```bash
npx wrangler secret put ADMIN_PIN        # PIN for the first administrator (member no. 1)
npm run deploy                           # creates the tables and publishes the site
```

Wrangler prints the address (`https://tennis-booking.<your-account>.workers.dev`). Log in as member 1 with the PIN
you chose, and change club name, texts and fees under **Administration > Indstillinger og tekster**.
To use your own domain, add it under the Worker's **Settings > Domains & Routes** in the Cloudflare dashboard.

## Automatic deploys from GitHub

`.github/workflows/deploy.yml` runs the tests on every push and pull request. Pushes to `main` also deploy, once
the repository has two secrets (GitHub: **Settings > Secrets and variables > Actions**):

- `CLOUDFLARE_API_TOKEN`: create it in Cloudflare under **My Profile > API Tokens** with the
  "Edit Cloudflare Workers" template, plus **D1: Edit** permission.
- `CLOUDFLARE_ACCOUNT_ID`: shown on the Workers overview page in Cloudflare.

Without the secrets the deploy step is skipped, and the tests still run.

## E-mail and SMS

Set these as Worker secrets (`npx wrangler secret put NAME`):

| Secret | What for |
|---|---|
| `RESEND_API_KEY`, `MAIL_FROM` | E-mail through [resend.com](https://resend.com) (free tier). `MAIL_FROM` must use a domain you verified there. |
| `CPSMS_USERNAME`, `CPSMS_APIKEY` | SMS through [cpsms.dk](https://www.cpsms.dk), as the old site used. |

Without them, messages are only written to the Worker log (Cloudflare dashboard > the Worker > Logs).

## Develop locally

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run seed-demo && npx wrangler d1 execute DB --local --file demo.sql   # optional demo data, PIN 1111
npm run dev                                                               # http://localhost:8787
npm test
```

## Moving members from the old database

Export the old `medlemmer` table to CSV (phpMyAdmin > Export > CSV, with column names in the first row), then:

```bash
npm run import-members -- medlemmer.csv
npx wrangler d1 execute DB --remote --file import-members.sql
```

Members keep their member number and current PIN. Rows without a PIN get a new one, listed in `nye-pinkoder.csv`.
Delete both generated files afterwards, since they contain personal data. Old bookings are not imported.

## What it does

| Old site | New site |
|---|---|
| Login with member number + PIN | Same. PINs are hashed, sessions are server-side, repeated wrong PINs are throttled. |
| Week overview per court (Bane 1 hourly 07-22, Bane 2 in 90-min slots 06:30-23:00) | Same courts and times, plus week arrows, "today" button, and a day-by-day view on phones. Admins can change courts and times. |
| Book a slot and choose a partner | Same. Double bookings and bookings in the past are blocked. |
| Edit partner (creator/admin), delete booking (creator/partner/admin) | Same rules. |
| Max bookings per member (1, 2, 3, 5, 10, 999) | Same, and enforced (it was switched off in the old code). Bookings for today don't count. |
| Edit own details, change PIN | Same. |
| Forgotten PIN by member no., e-mail or mobile | Sends a new PIN by e-mail/SMS. |
| "Bliv medlem" sign-up with fees | Same. Fees are editable. |
| Admin: members list, create, edit, deactivate, activate, delete, print list | Same, plus search and CSV export. |
| Admin: pending sign-ups, create member from sign-up | Same; the form is pre-filled. |
| Activity log, info pages (Om klubben, Kontakt, Turnering, Sponsorer), guide | Same; texts are edited in Administration. |

## Layout

```
src/index.js          Worker entry
src/app.js            Hono app and middleware
src/routes/           public pages, bookings, profile, admin
src/views/            HTML templates
src/db.js             query helpers, settings, log
src/session.js        login sessions, CSRF protection
migrations/           D1 schema and default data
public/               CSS, small JS, icon (served as static assets)
scripts/              import-members, seed-demo
test/                 end-to-end tests (node:test, D1 stand-in in test-support/)
```
