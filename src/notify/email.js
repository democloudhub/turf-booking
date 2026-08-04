const { getVenue, slotLabel } = require('../venue');
const { getResendConfig } = require('../settings');

function notificationsEnabled() {
  return String(process.env.NOTIFY_ENABLED || 'false').toLowerCase() === 'true';
}

function bookingSummary(booking, venue) {
  return {
    venueName: venue.name,
    bookingId: booking.id,
    name: booking.name,
    date: booking.bookingDate,
    slot: booking.slotLabel || slotLabel(booking.slotStart, booking.slotEnd),
    amount: booking.amount,
    phone: venue.phone,
    address: venue.address
  };
}

async function sendBookingEmail(booking) {
  const venue = await getVenue();
  const info = bookingSummary(booking, venue);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const { generateQrDataUrl } = require('../receipt');
  const qrDataUrl = await generateQrDataUrl(booking.id, appUrl);

  const subject = `Booking Confirmed — ${info.bookingId} | ${info.venueName}`;
  const text = [
    `Hi ${info.name},`,
    '',
    `Your turf booking is confirmed.`,
    '',
    `Booking ID: ${info.bookingId}`,
    `Venue: ${info.venueName}`,
    `Date: ${info.date}`,
    `Slot: ${info.slot}`,
    `Amount: ₹${info.amount}`,
    `Address: ${info.address}`,
    `Contact: ${info.phone}`,
    '',
    'Please show your QR code / Booking ID at check-in.',
    `Confirmation page: ${appUrl.replace(/\/$/, '')}/confirmation?id=${info.bookingId}`,
    '',
    `— ${info.venueName}`
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#1b5e20">Booking Confirmed</h2>
      <p>Hi ${escapeHtml(info.name)},</p>
      <p>Your turf booking is confirmed.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Booking ID</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.bookingId)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Venue</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.venueName)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Date</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.date)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Slot</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.slot)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Amount</strong></td><td style="padding:8px;border:1px solid #ddd">₹${info.amount}</td></tr>
      </table>
      <div style="text-align:center;margin:20px 0;padding:16px;border:1px solid #c8e6c9;border-radius:8px;background:#f7fbf7">
        <p style="margin:0 0 10px;font-weight:700;color:#1b5e20">Check-in QR Code</p>
        <img src="${qrDataUrl}" alt="Booking QR code" width="220" height="220" style="display:block;margin:0 auto" />
        <p style="margin:10px 0 0;color:#555;font-size:13px">Show this QR or Booking ID at the venue</p>
      </div>
      <p><a href="${escapeHtml(appUrl.replace(/\/$/, ''))}/confirmation?id=${escapeHtml(info.bookingId)}">Open confirmation page</a></p>
      <p style="color:#555">— ${escapeHtml(info.venueName)} · ${escapeHtml(info.phone)}</p>
    </div>
  `;

  return sendMail({
    to: booking.email,
    subject,
    text,
    html,
    channel: 'email',
    bypassFlag: true
  });
}

async function sendCancellationEmail(booking, reason) {
  const venue = await getVenue();
  const info = bookingSummary(booking, venue);
  const reasonText = reason || booking.cancelReason || '';
  const reasonClean = reasonText ? String(reasonText).trim() : '';
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const subject = `Booking Cancelled — ${info.bookingId} | ${info.venueName}`;
  const text = [
    `Hi ${info.name},`,
    '',
    `Your turf booking has been cancelled by the venue.`,
    '',
    `Booking ID: ${info.bookingId}`,
    `Venue: ${info.venueName}`,
    `Date: ${info.date}`,
    `Slot: ${info.slot}`,
    `Amount: ₹${info.amount}`,
    reasonClean ? `Reason: ${reasonClean}` : null,
    '',
    `Confirmation page: ${appUrl}/confirmation?id=${info.bookingId}`,
    `For help, contact ${info.phone}.`,
    '',
    `— ${info.venueName}`
  ]
    .filter((line) => line !== null)
    .join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#c62828">Booking Cancelled</h2>
      <p>Hi ${escapeHtml(info.name)},</p>
      <p>Your turf booking has been cancelled by the venue.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Booking ID</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.bookingId)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Venue</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.venueName)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Date</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.date)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Slot</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.slot)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Amount</strong></td><td style="padding:8px;border:1px solid #ddd">₹${info.amount}</td></tr>
        ${reasonClean ? `<tr><td style="padding:8px;border:1px solid #ddd"><strong>Reason</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(reasonClean)}</td></tr>` : ''}
      </table>
      <p><a href="${escapeHtml(appUrl)}/confirmation?id=${escapeHtml(info.bookingId)}">Open confirmation page</a></p>
      <p>For help, contact ${escapeHtml(info.phone)}.</p>
      <p style="color:#555">— ${escapeHtml(info.venueName)}</p>
    </div>
  `;

  return sendMail({
    to: booking.email,
    subject,
    text,
    html,
    channel: 'email',
    bypassFlag: true
  });
}

async function sendCheckedInEmail(booking) {
  const venue = await getVenue();
  const info = bookingSummary(booking, venue);
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const subject = `Checked In — ${info.bookingId} | ${info.venueName}`;
  const text = [
    `Hi ${info.name},`,
    '',
    `You have been checked in at ${info.venueName}. Enjoy your game!`,
    '',
    `Booking ID: ${info.bookingId}`,
    `Date: ${info.date}`,
    `Slot: ${info.slot}`,
    `Amount: ₹${info.amount}`,
    '',
    `Confirmation page: ${appUrl}/confirmation?id=${info.bookingId}`,
    '',
    `— ${info.venueName}`
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#2e7d32">Checked In</h2>
      <p>Hi ${escapeHtml(info.name)},</p>
      <p>You have been checked in at <strong>${escapeHtml(info.venueName)}</strong>. Enjoy your game!</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Booking ID</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.bookingId)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Date</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.date)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Slot</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.slot)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Amount</strong></td><td style="padding:8px;border:1px solid #ddd">₹${info.amount}</td></tr>
      </table>
      <p><a href="${escapeHtml(appUrl)}/confirmation?id=${escapeHtml(info.bookingId)}">Open confirmation page</a></p>
      <p style="color:#555">— ${escapeHtml(info.venueName)} · ${escapeHtml(info.phone)}</p>
    </div>
  `;

  return sendMail({
    to: booking.email,
    subject,
    text,
    html,
    channel: 'email',
    bypassFlag: true
  });
}

async function sendAdminBookingEmail(booking) {
  const venue = await getVenue();
  const info = bookingSummary(booking, venue);
  const { getAdminProfile } = require('../settings');
  const profile = await getAdminProfile();
  const to = profile.email || process.env.ADMIN_EMAIL || venue.contactEmail;

  if (!to) {
    console.warn('[admin-email] Admin profile email / ADMIN_EMAIL / venue contact not set');
    return { skipped: true, channel: 'admin-email', reason: 'no_admin_email' };
  }

  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const subject = `New booking ${info.bookingId} — ${info.venueName}`;
  const text = [
    `New turf booking received.`,
    '',
    `Booking ID: ${info.bookingId}`,
    `Customer: ${info.name}`,
    `Mobile: ${booking.mobile}`,
    `Email: ${booking.email}`,
    `Date: ${info.date}`,
    `Slot: ${info.slot}`,
    `Amount: ₹${info.amount}`,
    booking.notes ? `Notes: ${booking.notes}` : null,
    '',
    appUrl ? `Admin: ${appUrl}/admin` : null
  ]
    .filter((line) => line !== null)
    .join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#1b5e20">New Booking</h2>
      <p>A customer just booked a slot.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Booking ID</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.bookingId)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Customer</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.name)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Mobile</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(booking.mobile)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Email</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(booking.email)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Date</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.date)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Slot</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(info.slot)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Amount</strong></td><td style="padding:8px;border:1px solid #ddd">₹${info.amount}</td></tr>
      </table>
      ${appUrl ? `<p><a href="${escapeHtml(appUrl)}/admin">Open Admin</a></p>` : ''}
    </div>
  `;

  return sendMail({
    to,
    subject,
    text,
    html,
    channel: 'admin-email',
    bypassFlag: true
  });
}

async function sendMail({ to, subject, text, html, channel, bypassFlag = false }) {
  // Emails (customer + admin) send whenever Resend is configured.
  // SMS/WhatsApp still use notificationsEnabled() in their own senders.
  if (!bypassFlag && !notificationsEnabled()) {
    console.log(`[${channel} skipped]`, { to, subject });
    return { skipped: true, channel };
  }

  const cfg = await getResendConfig();
  if (!cfg.configured) {
    console.warn(`[${channel}] Resend API not configured`);
    return { skipped: true, channel, reason: 'not_configured' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [to],
      subject,
      text,
      html
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body.message || body.error || `Resend HTTP ${res.status}`;
    console.error(`[${channel}] Resend failed`, message);
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return { ok: true, channel, id: body.id };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendMailTest(to) {
  const cfg = await getResendConfig();
  if (!cfg.configured) {
    const err = new Error('Resend API is not configured');
    err.status = 400;
    throw err;
  }
  if (!to) {
    const err = new Error('A destination email is required for the test');
    err.status = 400;
    throw err;
  }
  return sendMail({
    to,
    subject: 'Turf Booking — Resend test',
    text: 'Resend email is working for Turf Booking.',
    html: '<p>Resend email is working for <strong>Turf Booking</strong>.</p>',
    channel: 'email-test',
    bypassFlag: true
  });
}

module.exports = {
  sendBookingEmail,
  sendCancellationEmail,
  sendCheckedInEmail,
  sendAdminBookingEmail,
  sendMailTest,
  notificationsEnabled
};
