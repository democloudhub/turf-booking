const nodemailer = require('nodemailer');
const { getVenue, slotLabel } = require('../venue');

function notificationsEnabled() {
  return String(process.env.NOTIFY_ENABLED || 'false').toLowerCase() === 'true';
}

function createTransport() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
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
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

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
        <img src="cid:booking-qr" alt="Booking QR code" width="220" height="220" style="display:block;margin:0 auto" />
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
    bypassFlag: true,
    attachments: [
      {
        filename: `qr-${booking.id}.png`,
        content: qrBuffer,
        cid: 'booking-qr',
        contentType: 'image/png'
      }
    ]
  });
}

async function sendCancellationEmail(booking, reason) {
  const venue = await getVenue();
  const info = bookingSummary(booking, venue);
  const reasonText = reason ? String(reason).trim() : '';
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
    reasonText ? `Reason: ${reasonText}` : null,
    '',
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
        ${reasonText ? `<tr><td style="padding:8px;border:1px solid #ddd"><strong>Reason</strong></td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(reasonText)}</td></tr>` : ''}
      </table>
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

async function sendAdminBookingEmail(booking) {
  const venue = await getVenue();
  const info = bookingSummary(booking, venue);
  const to =
    process.env.ADMIN_EMAIL ||
    venue.contactEmail ||
    process.env.SMTP_USER;

  if (!to) {
    console.warn('[admin-email] ADMIN_EMAIL / venue contact / SMTP_USER not set');
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

async function sendMail({ to, subject, text, html, channel, bypassFlag = false, attachments = [] }) {
  // Emails (customer + admin) send whenever SMTP is configured.
  // SMS/WhatsApp still use notificationsEnabled() in their own senders.
  if (!bypassFlag && !notificationsEnabled()) {
    console.log(`[${channel} skipped]`, { to, subject });
    return { skipped: true, channel };
  }

  const transporter = createTransport();
  if (!transporter) {
    console.warn(`[${channel}] SMTP not configured`);
    return { skipped: true, channel, reason: 'not_configured' };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
    attachments
  });
  return { ok: true, channel };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  sendBookingEmail,
  sendCancellationEmail,
  sendAdminBookingEmail,
  notificationsEnabled
};
