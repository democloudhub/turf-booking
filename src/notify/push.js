const webpush = require('web-push');
const { getDb } = require('../db');
const { getSetting, setSetting, getAdminProfile } = require('../settings');
const { slotLabel } = require('../venue');

async function ensureVapidKeys() {
  let publicKey = process.env.VAPID_PUBLIC_KEY || (await getSetting('vapid_public_key'));
  let privateKey = process.env.VAPID_PRIVATE_KEY || (await getSetting('vapid_private_key'));

  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    await setSetting('vapid_public_key', publicKey);
    await setSetting('vapid_private_key', privateKey);
  } else {
    if (!(await getSetting('vapid_public_key'))) {
      await setSetting('vapid_public_key', publicKey);
    }
    if (!(await getSetting('vapid_private_key'))) {
      await setSetting('vapid_private_key', privateKey);
    }
  }

  const profile = await getAdminProfile();
  const subject =
    process.env.VAPID_SUBJECT ||
    (profile.email ? `mailto:${profile.email}` : null) ||
    process.env.ADMIN_EMAIL ||
    process.env.GMAIL_USER ||
    process.env.SMTP_USER ||
    'mailto:admin@turf-booking.local';
  webpush.setVapidDetails(subject.startsWith('mailto:') ? subject : `mailto:${subject}`, publicKey, privateKey);
  return { publicKey, privateKey };
}

async function getVapidPublicKey() {
  const keys = await ensureVapidKeys();
  return keys.publicKey;
}

async function saveSubscription(subscription) {
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    const err = new Error('Invalid push subscription');
    err.status = 400;
    throw err;
  }
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET
            p256dh = excluded.p256dh,
            auth = excluded.auth`,
    args: [
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      new Date().toISOString()
    ]
  });
  return true;
}

async function removeSubscription(endpoint) {
  if (!endpoint) return;
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?',
    args: [endpoint]
  });
}

async function listSubscriptions() {
  const db = getDb();
  const result = await db.execute('SELECT endpoint, p256dh, auth FROM push_subscriptions');
  return result.rows.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth }
  }));
}

async function sendAdminBookingPush(booking) {
  await ensureVapidKeys();
  const subscriptions = await listSubscriptions();
  if (!subscriptions.length) {
    console.log('[push skipped] no admin subscriptions');
    return { skipped: true, channel: 'push', reason: 'no_subscriptions' };
  }

  const slot = booking.slotLabel || slotLabel(booking.slotStart, booking.slotEnd);
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const payload = JSON.stringify({
    title: 'New turf booking',
    body: `${booking.name} · ${booking.bookingDate} · ${slot} · ₹${booking.amount}`,
    url: `${appUrl}/admin`,
    bookingId: booking.id
  });

  let sent = 0;
  let failed = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error('[push] failed', err.statusCode || err.message);
      if (err.statusCode === 404 || err.statusCode === 410) {
        await removeSubscription(sub.endpoint);
      }
    }
  }

  return { ok: sent > 0, channel: 'push', sent, failed };
}

module.exports = {
  ensureVapidKeys,
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
  sendAdminBookingPush
};
