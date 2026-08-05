const express = require('express');
const {
  getAvailability,
  getBookingById,
  createBooking
} = require('../bookings');
const { findUserById, mapUser } = require('../users');
const { requireUser, optionalUser, optionalAdmin } = require('../auth');
const { sendAllConfirmations, notifyAdminNewBooking } = require('../notify');
const { generateQrDataUrl, buildReceiptPdf } = require('../receipt');

const router = express.Router();

router.get('/availability', async (req, res) => {
  try {
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Query param date=YYYY-MM-DD is required' });
    }
    const data = await getAvailability(date);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load availability' });
  }
});

router.post('/', requireUser, async (req, res) => {
  try {
    const profile = mapUser(await findUserById(req.user.userId));
    if (!profile) {
      return res.status(401).json({ error: 'Please log in to continue', code: 'LOGIN_REQUIRED' });
    }

    const booking = await createBooking({
      userId: profile.id,
      name: req.body.name || profile.name,
      mobile: req.body.mobile || profile.mobile,
      email: profile.email,
      bookingDate: req.body.bookingDate || req.body.date,
      slotStart: req.body.slotStart,
      notes: req.body.notes
    });

    const [notifications, adminNotifications] = await Promise.all([
      sendAllConfirmations(booking),
      notifyAdminNewBooking(booking)
    ]);
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const qrDataUrl = await generateQrDataUrl(booking.id, appUrl);

    res.status(201).json({
      booking,
      qrDataUrl,
      notifications,
      adminNotifications
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Booking failed' });
  }
});

function isBookingOwner(booking, user) {
  if (!booking || !user) return false;
  if (booking.userId && booking.userId === user.userId) return true;
  // Fallback for older rows that may lack user_id
  if (
    booking.email &&
    user.email &&
    String(booking.email).toLowerCase() === String(user.email).toLowerCase()
  ) {
    return true;
  }
  return false;
}

router.get('/:id', optionalAdmin, optionalUser, async (req, res) => {
  try {
    const booking = await getBookingById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    // Admin access only when explicitly requested (?view=admin) — prevents an
    // admin cookie from unlocking every booking on the customer confirmation page.
    const adminView = String(req.query.view || '') === 'admin';
    const isAdmin = Boolean(req.admin) && adminView;
    const isOwner = isBookingOwner(booking, req.user);

    if (adminView && !req.admin) {
      return res.status(401).json({ error: 'Admin login required', code: 'ADMIN_LOGIN_REQUIRED' });
    }
    if (!isAdmin && !isOwner) {
      if (!req.user) {
        return res.status(401).json({ error: 'Please log in to continue', code: 'LOGIN_REQUIRED' });
      }
      return res.status(403).json({ error: 'Not allowed to view this booking' });
    }
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const qrDataUrl = await generateQrDataUrl(booking.id, appUrl);
    res.json({
      booking,
      qrDataUrl,
      viewer: isAdmin ? 'admin' : 'customer'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load booking' });
  }
});

router.get('/:id/receipt.pdf', optionalAdmin, optionalUser, async (req, res) => {
  try {
    const booking = await getBookingById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const adminView = String(req.query.view || '') === 'admin';
    const isAdmin = Boolean(req.admin) && adminView;
    const isOwner = isBookingOwner(booking, req.user);
    if (adminView && !req.admin) {
      return res.status(401).json({ error: 'Admin login required', code: 'ADMIN_LOGIN_REQUIRED' });
    }
    if (!isAdmin && !isOwner) {
      if (!req.user) {
        return res.status(401).json({ error: 'Please log in to continue', code: 'LOGIN_REQUIRED' });
      }
      return res.status(403).json({ error: 'Not allowed to download this receipt' });
    }
    const pdf = await buildReceiptPdf(booking);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt-${booking.id}.pdf"`
    );
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to generate PDF' });
  }
});

router.get('/:id/qr', async (req, res) => {
  try {
    const booking = await getBookingById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const qrDataUrl = await generateQrDataUrl(booking.id, appUrl);
    res.json({ bookingId: booking.id, qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to generate QR' });
  }
});

module.exports = router;
