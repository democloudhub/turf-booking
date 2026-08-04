const { getVenue, slotLabel } = require('../venue');
const {
  notificationsEnabled,
  sendBookingEmail,
  sendCancellationEmail,
  sendCheckedInEmail,
  sendAdminBookingEmail,
  sendWelcomeSetPasswordEmail,
  sendPasswordResetEmail
} = require('./email');
const { sendAdminBookingPush } = require('./push');

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  const twilio = require('twilio');
  return twilio(sid, token);
}

function normalizeMobile(mobile) {
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (String(mobile).startsWith('+')) return String(mobile);
  return `+${digits}`;
}

function buildConfirmMessage(booking, venue) {
  const slot = booking.slotLabel || slotLabel(booking.slotStart, booking.slotEnd);
  return [
    `${venue.name} — Booking Confirmed`,
    `ID: ${booking.id}`,
    `Date: ${booking.bookingDate}`,
    `Slot: ${slot}`,
    `Amount: ₹${booking.amount}`,
    `Show this ID / QR at check-in.`
  ].join('\n');
}

function buildCancelMessage(booking, venue, reason) {
  const slot = booking.slotLabel || slotLabel(booking.slotStart, booking.slotEnd);
  const lines = [
    `${venue.name} — Booking Cancelled`,
    `ID: ${booking.id}`,
    `Date: ${booking.bookingDate}`,
    `Slot: ${slot}`,
    `Amount: ₹${booking.amount}`
  ];
  if (reason && String(reason).trim()) {
    lines.push(`Reason: ${String(reason).trim()}`);
  }
  lines.push(`Contact: ${venue.phone}`);
  return lines.join('\n');
}

async function sendSms(to, body, channel = 'sms') {
  if (!notificationsEnabled()) {
    console.log(`[${channel} skipped]`, { to, body });
    return { skipped: true, channel };
  }

  const client = getTwilioClient();
  const from = process.env.TWILIO_SMS_FROM;
  if (!client || !from) {
    console.warn(`[${channel}] Twilio SMS not configured`);
    return { skipped: true, channel, reason: 'not_configured' };
  }

  await client.messages.create({ from, to, body });
  return { ok: true, channel };
}

async function sendWhatsApp(to, body, channel = 'whatsapp') {
  if (!notificationsEnabled()) {
    console.log(`[${channel} skipped]`, { to, body });
    return { skipped: true, channel };
  }

  const client = getTwilioClient();
  const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  if (!client) {
    console.warn(`[${channel}] Twilio not configured`);
    return { skipped: true, channel, reason: 'not_configured' };
  }

  await client.messages.create({ from, to, body });
  return { ok: true, channel };
}

async function sendBookingSms(booking) {
  const venue = await getVenue();
  return sendSms(normalizeMobile(booking.mobile), buildConfirmMessage(booking, venue), 'sms');
}

async function sendBookingWhatsApp(booking) {
  const venue = await getVenue();
  return sendWhatsApp(
    `whatsapp:${normalizeMobile(booking.mobile)}`,
    buildConfirmMessage(booking, venue),
    'whatsapp'
  );
}

async function sendCancellationSms(booking, reason) {
  const venue = await getVenue();
  return sendSms(
    normalizeMobile(booking.mobile),
    buildCancelMessage(booking, venue, reason),
    'sms'
  );
}

async function sendCancellationWhatsApp(booking, reason) {
  const venue = await getVenue();
  return sendWhatsApp(
    `whatsapp:${normalizeMobile(booking.mobile)}`,
    buildCancelMessage(booking, venue, reason),
    'whatsapp'
  );
}

function settleResults(results, channels) {
  return results.map((r, i) => {
    const channel = channels[i];
    if (r.status === 'fulfilled') return r.value;
    console.error(`[${channel}] failed`, r.reason);
    return {
      ok: false,
      channel,
      error: String(r.reason && r.reason.message ? r.reason.message : r.reason)
    };
  });
}

async function sendAllConfirmations(booking) {
  const results = await Promise.allSettled([
    sendBookingEmail(booking),
    sendBookingSms(booking),
    sendBookingWhatsApp(booking)
  ]);
  return settleResults(results, ['email', 'sms', 'whatsapp']);
}

async function sendAllCancellations(booking, reason) {
  const results = await Promise.allSettled([
    sendCancellationEmail(booking, reason),
    sendCancellationSms(booking, reason),
    sendCancellationWhatsApp(booking, reason)
  ]);
  return settleResults(results, ['email', 'sms', 'whatsapp']);
}

async function sendCheckedInNotification(booking) {
  const results = await Promise.allSettled([sendCheckedInEmail(booking)]);
  return settleResults(results, ['email']);
}

async function notifyAdminNewBooking(booking) {
  const results = await Promise.allSettled([
    sendAdminBookingEmail(booking),
    sendAdminBookingPush(booking)
  ]);
  return settleResults(results, ['admin-email', 'push']);
}

async function sendWelcomeWithPasswordSetup(user, resetToken, booking) {
  return sendWelcomeSetPasswordEmail(user, resetToken, booking);
}

async function sendPasswordReset(user, resetToken) {
  return sendPasswordResetEmail(user, resetToken);
}

module.exports = {
  sendBookingSms,
  sendBookingWhatsApp,
  sendAllConfirmations,
  sendAllCancellations,
  sendCheckedInNotification,
  notifyAdminNewBooking,
  sendWelcomeWithPasswordSetup,
  sendPasswordReset,
  normalizeMobile
};
