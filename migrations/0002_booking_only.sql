-- The site is now only for court booking: sign-ups, membership fees and the club info pages are gone.
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS member_types;
DELETE FROM settings WHERE key IN ('club_address', 'join_text', 'payment_text', 'about_text', 'contact_text', 'tournament_text', 'sponsors_text');
