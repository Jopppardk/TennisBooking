-- Tennis booking: initial schema and defaults
CREATE TABLE members (
  id            INTEGER PRIMARY KEY,
  member_no     INTEGER NOT NULL UNIQUE,
  pin_hash      TEXT NOT NULL,
  name          TEXT NOT NULL,
  address       TEXT NOT NULL DEFAULT '',
  postcode      TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  mobile        TEXT NOT NULL DEFAULT '',
  birthdate     TEXT NOT NULL DEFAULT '',
  member_type   TEXT NOT NULL DEFAULT '',
  is_admin      INTEGER NOT NULL DEFAULT 0,
  max_bookings  INTEGER NOT NULL DEFAULT 1,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT,
  updated_by    TEXT
);

CREATE TABLE courts (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  sort    INTEGER NOT NULL DEFAULT 0,
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE court_slots (
  id         INTEGER PRIMARY KEY,
  court_id   INTEGER NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  start_time TEXT NOT NULL,
  end_time   TEXT NOT NULL,
  UNIQUE (court_id, start_time)
);

CREATE TABLE bookings (
  id          INTEGER PRIMARY KEY,
  court_id    INTEGER NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  partner_id  INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT,
  updated_by  INTEGER,
  UNIQUE (court_id, date, start_time)
);
CREATE INDEX bookings_member ON bookings(member_id, date);
CREATE INDEX bookings_partner ON bookings(partner_id, date);

CREATE TABLE member_types (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE applications (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  postcode    TEXT NOT NULL,
  city        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  mobile      TEXT NOT NULL DEFAULT '',
  birthdate   TEXT NOT NULL DEFAULT '',
  member_type TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  processed   INTEGER NOT NULL DEFAULT 0,
  member_id   INTEGER REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- "at" is local club time, written by the app.
CREATE TABLE log (
  id      INTEGER PRIMARY KEY,
  at      TEXT NOT NULL,
  user    TEXT NOT NULL DEFAULT '',
  event   TEXT NOT NULL,
  ip      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  csrf       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Failed logins and PIN reminders, used to slow down guessing (Workers keep no memory between requests).
CREATE TABLE throttle (
  key    TEXT PRIMARY KEY,
  first  INTEGER NOT NULL,
  count  INTEGER NOT NULL
);

INSERT INTO settings (key, value) VALUES ('club_name', 'Tennisklubben');
INSERT INTO settings (key, value) VALUES ('club_email', 'info@example.dk');
INSERT INTO settings (key, value) VALUES ('club_phone', '');
INSERT INTO settings (key, value) VALUES ('club_address', '');
INSERT INTO settings (key, value) VALUES ('sms_sender', 'Tennis');
INSERT INTO settings (key, value) VALUES ('booking_days_ahead', '0');
INSERT INTO settings (key, value) VALUES ('front_text', 'Kære tennisspiller

Sæsonen er i gang, banerne er klargjort og klar til brug.

Vi ønsker jer alle en rigtig god tennissæson!');
INSERT INTO settings (key, value) VALUES ('missing_login_text', 'Er du medlem, men har ikke modtaget en pinkode til bookingsystemet, så kontakt os på mail eller telefon.');
INSERT INTO settings (key, value) VALUES ('join_text', 'Når tilmeldingen er modtaget, får du en anmodning om betaling af kontingent pr. e-mail. Så snart det er indbetalt, modtager du et medlemsnummer og en pinkode og kan spille med det samme.');
INSERT INTO settings (key, value) VALUES ('payment_text', 'Overfør kontingentet til klubbens konto. Skriv dit navn i beskeden.');
INSERT INTO settings (key, value) VALUES ('about_text', 'Bestyrelsen:

Formand: 
Kasserer: 
Sekretær: ');
INSERT INTO settings (key, value) VALUES ('contact_text', 'Har du spørgsmål, er du velkommen til at kontakte os.');
INSERT INTO settings (key, value) VALUES ('tournament_text', 'Vi vil prøve at få stablet en turnering på benene. Mere om det senere.');
INSERT INTO settings (key, value) VALUES ('sponsors_text', '');

INSERT INTO courts (id, name, sort) VALUES (1, 'Bane 1', 1), (2, 'Bane 2', 2);
INSERT INTO court_slots (court_id, start_time, end_time) VALUES (1, '07:00', '08:00'), (1, '08:00', '09:00'), (1, '09:00', '10:00'), (1, '10:00', '11:00'), (1, '11:00', '12:00'), (1, '12:00', '13:00'), (1, '13:00', '14:00'), (1, '14:00', '15:00'), (1, '15:00', '16:00'), (1, '16:00', '17:00'), (1, '17:00', '18:00'), (1, '18:00', '19:00'), (1, '19:00', '20:00'), (1, '20:00', '21:00'), (1, '21:00', '22:00');
INSERT INTO court_slots (court_id, start_time, end_time) VALUES (2, '06:30', '08:00'), (2, '08:00', '09:30'), (2, '09:30', '11:00'), (2, '11:00', '12:30'), (2, '12:30', '14:00'), (2, '14:00', '15:30'), (2, '15:30', '17:00'), (2, '17:00', '18:30'), (2, '18:30', '20:00'), (2, '20:00', '21:30'), (2, '21:30', '23:00');

INSERT INTO member_types (name, description, price, sort) VALUES ('Junior', 'Under 19 år', 200, 1), ('Senior', '', 450, 2), ('Familie', 'Alle i husstanden', 750, 3), ('Pensionist', 'Over 60 år', 250, 4);
