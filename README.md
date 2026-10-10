# Tennis court booking

Court booking for a tennis club: members log in with member number and PIN and book courts; administrators manage
members, courts and times. It rebuilds the booking part of the old PHP site (Tvis IF Tennis / ambabooking.dk), without
the club pages (sign-up, fees, about, contact). The site itself is in Danish.

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
npm run deploy                           # creates the tables and publishes the site
```

Wrangler prints the address (`https://tennis-booking.<your-account>.workers.dev`). Then create the first
administrator (see below), log in, and set the name and front-page texts under **Administration > Indstillinger og tekster**.

## Create an administrator

In GitHub, open **Actions > Opret administrator > Run workflow** and enter member number, PIN and name. The member is
created as administrator (or an existing member gets admin rights and the new PIN). The PIN is only a workflow input,
so it never ends up in the repository or the log. Without GitHub: `node scripts/create-admin.js 42 1234 "Navn"`, then
`npx wrangler d1 execute DB --remote --file create-admin.sql`, and delete the file.

Alternatively set the Worker secrets `ADMIN_PIN` (and `ADMIN_MEMBER_NO`, default 1): when the database has no
administrator, the first request creates one with them.
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
| Admin: members list, create, edit, deactivate, activate, delete, print list | Same, plus search and CSV export. |
| Activity log, booking guide | Same. Front-page texts are edited in Administration. |
| Sign-up, fees, Om klubben, Kontakt, Turnering, Sponsorer | Left out: this is only the booking site. |

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
scripts/              create-admin, import-members, seed-demo
test/                 end-to-end tests (node:test, D1 stand-in in test-support/)
```
