const express = require('express');
const {
  login,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin
} = require('../auth');
const { changeAdminPassword, getAdminProfile, updateAdminProfile, getGmailConfigPublic, updateGmailConfig } = require('../settings');
const { getVenue, updateVenue } = require('../venue');
const {
  listBookings,
  getBookingById,
  setCheckedIn,
  cancelBooking
} = require('../bookings');
const { sendAllCancellations, sendCheckedInNotification } = require('../notify');
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
    res.json(await getGmailConfigPublic());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load email settings' });
  }
});

router.put('/email', requireAdmin, async (req, res) => {
  try {
    const config = await updateGmailConfig(req.body);
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update email settings' });
  }
});

router.post('/email/test', requireAdmin, async (req, res) => {
  try {
    const { getGmailConfig } = require('../settings');
    const { sendMailTest } = require('../notify/email');
    const cfg = await getGmailConfig();
    if (!cfg.configured) {
      return res.status(400).json({ error: 'Gmail OAuth is not fully configured yet' });
    }
    const to = (req.body && req.body.to) || cfg.user;
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

router.post('/bookings/:id/check-in', requireAdmin, async (req, res) => {
  try {
    const checkedIn = req.body.checkedIn !== false;
    const booking = await setCheckedIn(req.params.id, checkedIn);
    let notifications = [];
    if (checkedIn) {
      notifications = await sendCheckedInNotification(booking);
    }
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
