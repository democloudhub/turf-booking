const express = require('express');
const {
  registerUser,
  authenticateUser,
  findUserById,
  updateUserProfile,
  mapUser
} = require('../users');
const {
  createUserSessionToken,
  setUserSessionCookie,
  clearUserSessionCookie,
  requireUser
} = require('../auth');
const { listBookingsByUser } = require('../bookings');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const user = await registerUser({
      name: req.body.name,
      email: req.body.email,
      mobile: req.body.mobile,
      password: req.body.password
    });
    const token = createUserSessionToken(user);
    setUserSessionCookie(res, token);
    res.status(201).json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const user = await authenticateUser(req.body.email, req.body.password);
    const token = createUserSessionToken(user);
    setUserSessionCookie(res, token);
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Login failed' });
  }
});

router.post('/logout', (_req, res) => {
  clearUserSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireUser, async (req, res) => {
  try {
    const row = await findUserById(req.user.userId);
    if (!row) {
      clearUserSessionCookie(res);
      return res.status(401).json({ error: 'Please log in to continue', code: 'LOGIN_REQUIRED' });
    }
    res.json({ user: mapUser(row) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load profile' });
  }
});

router.put('/me', requireUser, async (req, res) => {
  try {
    const user = await updateUserProfile(req.user.userId, {
      name: req.body.name,
      mobile: req.body.mobile
    });
    const token = createUserSessionToken(user);
    setUserSessionCookie(res, token);
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update profile' });
  }
});

router.get('/my-bookings', requireUser, async (req, res) => {
  try {
    const bookings = await listBookingsByUser(req.user.userId);
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load bookings' });
  }
});

module.exports = router;
