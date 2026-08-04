require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { ensureSchema } = require('./src/db');
const publicRoutes = require('./src/routes/public');
const bookingRoutes = require('./src/routes/bookings');
const adminRoutes = require('./src/routes/admin');
const authRoutes = require('./src/routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

const ready = ensureSchema();

app.use(async (_req, _res, next) => {
  try {
    await ready;
    next();
  } catch (err) {
    next(err);
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/account', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account.html'));
});

app.get('/availability', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'availability.html'));
});

app.get('/book', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'book.html'));
});

app.get('/confirmation', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'confirmation.html'));
});

app.get('/health', async (_req, res) => {
  await ready;
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

if (require.main === module) {
  ready
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Turf Booking running at http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start:', err);
      process.exit(1);
    });
}

module.exports = app;
