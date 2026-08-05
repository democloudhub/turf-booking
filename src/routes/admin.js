const express = require('express');
const {
  login,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin
} = require('../auth');
const { changeAdminPassword, getAdminProfile, updateAdminProfile, getResendConfigPublic, updateResendConfig, getResendConfig } = require('../settings');
const { getVenue, updateVenue } = require('../venue');
const {
  listBookings,
  getBookingById,
  setCheckedIn,
  cancelBooking,
  createBooking,
  checkInBooking,
  getAvailability
} = require('../bookings');
const {
  sendAllCancellations,
  sendCheckedInNotification,
  sendAllConfirmations,
  notifyAdminNewBooking
} = require('../notify');
const { findOrCreateCustomer, findUserByMobile, mapUser, listCustomers } = require('../users');
const { generateQrDataUrl } = require('../receipt');
const {
  getVapidPublicKey,
  saveSubscription,
  removeSubscription
} = require('../notify/push');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const token = await login(req.body.password);
    if (!token) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    setSessionCookie(res, token);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAdmin, async (_req, res) => {
  try {
    const profile = await getAdminProfile();
    res.json({ ok: true, role: 'admin', profile });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load admin profile' });
  }
});

router.get('/profile', requireAdmin, async (_req, res) => {
  try {
    res.json(await getAdminProfile());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load admin profile' });
  }
});

router.put('/profile', requireAdmin, async (req, res) => {
  try {
    const profile = await updateAdminProfile(req.body);
    res.json(profile);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update profile' });
  }
});

router.get('/email', requireAdmin, async (_req, res) => {
  try {
    res.json(await getResendConfigPublic());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load email settings' });
  }
});

router.put('/email', requireAdmin, async (req, res) => {
  try {
    const config = await updateResendConfig(req.body);
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update email settings' });
  }
});

router.post('/email/test', requireAdmin, async (req, res) => {
  try {
    const { sendMailTest } = require('../notify/email');
    const cfg = await getResendConfig();
    if (!cfg.configured) {
      return res.status(400).json({ error: 'Resend API is not fully configured yet' });
    }
    const profile = await getAdminProfile();
    const to = (req.body && req.body.to) || profile.email;
    if (!to) {
      return res.status(400).json({ error: 'Set an admin profile email (or pass to) for the test' });
    }
    const result = await sendMailTest(to);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to send test email' });
  }
});

router.get('/push/vapid-public-key', requireAdmin, async (_req, res) => {
  try {
    const publicKey = await getVapidPublicKey();
    res.json({ publicKey });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load VAPID key' });
  }
});

router.post('/push/subscribe', requireAdmin, async (req, res) => {
  try {
    await saveSubscription(req.body.subscription || req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to save subscription' });
  }
});

router.post('/push/unsubscribe', requireAdmin, async (req, res) => {
  try {
    await removeSubscription(req.body.endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to remove subscription' });
  }
});

router.post('/change-password', requireAdmin, async (req, res) => {
  try {
    await changeAdminPassword(req.body.currentPassword, req.body.newPassword);
    res.json({ ok: true, message: 'Password updated' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to change password' });
  }
});

router.get('/bookings', requireAdmin, async (req, res) => {
  try {
    const bookings = await listBookings({
      from: req.query.from,
      to: req.query.to,
      q: req.query.q,
      status: req.query.status,
      limit: Number(req.query.limit || 200)
    });
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to list bookings' });
  }
});

router.get('/bookings/:id', requireAdmin, async (req, res) => {
  try {
    const booking = await getBookingById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json({ booking });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load booking' });
  }
});

router.get('/availability', requireAdmin, async (req, res) => {
  try {
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Query param date=YYYY-MM-DD is required' });
    }
    res.json(await getAvailability(date));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load availability' });
  }
});

router.get('/customers/lookup', requireAdmin, async (req, res) => {
  try {
    const mobile = String(req.query.mobile || '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    }
    const row = await findUserByMobile(mobile);
    if (!row) {
      return res.json({ exists: false, user: null });
    }
    res.json({ exists: true, user: mapUser(row) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to look up customer' });
  }
});

router.get('/customers', requireAdmin, async (req, res) => {
  try {
    const customers = await listCustomers({ q: req.query.q || '' });
    const totals = customers.reduce(
      (acc, c) => {
        acc.customers += 1;
        acc.confirmed += c.bookings.confirmed;
        acc.checkedIn += c.bookings.checkedIn;
        acc.cancelled += c.bookings.cancelled;
        acc.bookings += c.bookings.total;
        acc.revenue += c.revenue;
        return acc;
      },
      { customers: 0, confirmed: 0, checkedIn: 0, cancelled: 0, bookings: 0, revenue: 0 }
    );
    res.json({ customers, totals });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to list customers' });
  }
});

router.post('/bookings', requireAdmin, async (req, res) => {
  try {
    const { user, created, resetToken } = await findOrCreateCustomer({
      name: req.body.name,
      email: req.body.email,
      mobile: req.body.mobile
    });

    const booking = await createBooking({
      userId: user.id,
      name: req.body.name || user.name,
      mobile: req.body.mobile || user.mobile,
      email: user.email,
      bookingDate: req.body.bookingDate || req.body.date,
      slotStart: req.body.slotStart,
      notes: req.body.notes || (req.body.onPremise ? 'Walk-in / on-premise booking' : ''),
      customAmount: req.body.customAmount
    });

    // New walk-in customers get a set-password link inside the confirmation email.
    const [notifications, adminNotifications] = await Promise.all([
      sendAllConfirmations(booking, {
        setPasswordToken: created && resetToken ? resetToken : null
      }),
      notifyAdminNewBooking(booking)
    ]);

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const qrDataUrl = await generateQrDataUrl(booking.id, appUrl);

    res.status(201).json({
      booking,
      qrDataUrl,
      user,
      accountCreated: created,
      setPasswordLinkIncluded: Boolean(created && resetToken),
      notifications,
      adminNotifications
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Walk-in booking failed' });
  }
});

router.post('/bookings/:id/check-in', requireAdmin, async (req, res) => {
  try {
    if (req.body.checkedIn === false) {
      const booking = await setCheckedIn(req.params.id, false);
      return res.json({ booking, notifications: [] });
    }
    const booking = await checkInBooking(req.params.id, {
      amountReceived: req.body.amountReceived,
      discount: req.body.discount,
      paymentMode: req.body.paymentMode
    });
    const notifications = await sendCheckedInNotification(booking);
    res.json({ booking, notifications });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Check-in failed' });
  }
});

router.post('/bookings/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const reason = req.body.reason || '';
    const booking = await cancelBooking(req.params.id, reason);
    const notifications = await sendAllCancellations(booking, reason || booking.cancelReason);
    res.json({ booking, notifications });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Cancel failed' });
  }
});

router.get('/venue', requireAdmin, async (_req, res) => {
  try {
    res.json(await getVenue());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load venue' });
  }
});

router.put('/venue', requireAdmin, async (req, res) => {
  try {
    const venue = await updateVenue(req.body);
    res.json(venue);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update venue' });
  }
});

module.exports = router;
