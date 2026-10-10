-- SMS is gone; e-mail is the only way the site sends messages.
DELETE FROM settings WHERE key = 'sms_sender';
