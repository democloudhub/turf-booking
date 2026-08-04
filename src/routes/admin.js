const express = require('express');
const {
  login,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin
} = require('../auth');
const { changeAdminPassword } = require('../settings');
const { getVenue, updateVenue } = require('../venue');
const {
  listBookings,
  getBookingById,
  setCheckedIn,
  cancelBooking
} = require('../bookings');
const { sendAllCancellations } = require('../notify');

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

router.get('/me', requireAdmin, (_req, res) => {
  res.json({ ok: true, role: 'admin' });
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
    res.json({ booking });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Check-in failed' });
  }
});

router.post('/bookings/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const reason = req.body.reason || '';
    const booking = await cancelBooking(req.params.id);
    const notifications = await sendAllCancellations(booking, reason);
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
