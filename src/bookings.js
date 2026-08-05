const { getDb } = require('./db');
const {
  getVenue,
  getPriceForDate,
  generateHourlySlots,
  slotLabel
} = require('./venue');

async function getBookingsForDate(dateStr) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM bookings
          WHERE booking_date = ? AND status != 'cancelled'
          ORDER BY slot_start ASC`,
    args: [dateStr]
  });
  return result.rows.map(mapBooking);
}

async function getBookingById(id) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM bookings WHERE id = ?',
    args: [id]
  });
  if (!result.rows.length) return null;
  return mapBooking(result.rows[0]);
}

async function listBookings({ from, to, limit = 100, q = '', status = '' } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM bookings WHERE 1=1';
  const args = [];
  if (from) {
    sql += ' AND booking_date >= ?';
    args.push(from);
  }
  if (to) {
    sql += ' AND booking_date <= ?';
    args.push(to);
  }
  const query = String(q || '').trim();
  if (query) {
    sql += ' AND (LOWER(id) LIKE ? OR LOWER(name) LIKE ? OR mobile LIKE ? OR LOWER(email) LIKE ?)';
    const like = `%${query.toLowerCase()}%`;
    args.push(like, like, `%${query.replace(/\D/g, '') || query}%`, like);
  }
  const statusFilter = String(status || '').trim().toLowerCase();
  if (statusFilter === 'cancelled') {
    sql += ` AND status = 'cancelled'`;
  } else if (statusFilter === 'checked-in' || statusFilter === 'checked_in') {
    sql += ` AND checked_in = 1 AND status != 'cancelled'`;
  } else if (statusFilter === 'confirmed') {
    sql += ` AND status != 'cancelled' AND checked_in = 0`;
  }
  sql += ' ORDER BY booking_date DESC, slot_start DESC LIMIT ?';
  args.push(limit);
  const result = await db.execute({ sql, args });
  return result.rows.map(mapBooking);
}

async function getAvailability(dateStr) {
  const venue = await getVenue();
  const bookings = await getBookingsForDate(dateStr);
  const bookedStarts = new Set(bookings.map((b) => b.slotStart));
  const pricing = getPriceForDate(venue, dateStr);
  const slots = generateHourlySlots(venue.openHour, venue.closeHour).map((slot) => {
    const booked = bookedStarts.has(slot.start);
    return {
      ...slot,
      available: !booked,
      status: booked ? 'booked' : 'available',
      price: pricing.amount,
      priceLabel: pricing.label
    };
  });

  return {
    date: dateStr,
    pricing,
    venue: {
      name: venue.name,
      openHour: venue.openHour,
      closeHour: venue.closeHour,
      weekdayPrice: venue.weekdayPrice,
      weekendPrice: venue.weekendPrice,
      holidayPrice: venue.holidayPrice
    },
    slots,
    bookings: bookings.map((b) => ({
      id: b.id,
      slotStart: b.slotStart,
      slotEnd: b.slotEnd,
      label: slotLabel(b.slotStart, b.slotEnd),
      name: b.name,
      status: b.status
    }))
  };
}

async function createBooking(payload) {
  const venue = await getVenue();
  const {
    userId = null,
    name,
    mobile,
    email,
    bookingDate,
    slotStart,
    notes = '',
    customAmount = null
  } = payload;

  if (!name || !mobile || !email || !bookingDate || slotStart == null) {
    const err = new Error('Missing required booking fields');
    err.status = 400;
    throw err;
  }

  const { assertValidMobile } = require('./users');
  const mobileDigits = assertValidMobile(mobile);

  const start = Number(slotStart);
  const end = start + 1;

  if (start < venue.openHour || end > venue.closeHour) {
    const err = new Error('Selected slot is outside operating hours');
    err.status = 400;
    throw err;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const chosen = new Date(`${bookingDate}T12:00:00`);
  if (Number.isNaN(chosen.getTime()) || chosen < today) {
    const err = new Error('Booking date must be today or a future date');
    err.status = 400;
    throw err;
  }

  const availability = await getAvailability(bookingDate);
  const slot = availability.slots.find((s) => s.start === start);
  if (!slot || !slot.available) {
    const err = new Error('Selected slot is not available');
    err.status = 409;
    throw err;
  }

  const id = `TB-${require('crypto').randomBytes(4).toString('hex').toUpperCase()}`;
  const pricing = getPriceForDate(venue, bookingDate);
  let amount = pricing.amount;
  if (customAmount != null && customAmount !== '') {
    const custom = Number(customAmount);
    if (!Number.isFinite(custom) || custom < 0) {
      const err = new Error('Custom price must be a valid non-negative amount');
      err.status = 400;
      throw err;
    }
    amount = custom;
  }
  const createdAt = new Date().toISOString();

  const db = getDb();
  try {
    await db.execute({
      sql: `INSERT INTO bookings (
        id, user_id, name, mobile, email, booking_date, slot_start, slot_end,
        amount, notes, status, checked_in, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 0, ?)`,
      args: [
        id,
        userId,
        name.trim(),
        mobileDigits,
        email.trim().toLowerCase(),
        bookingDate,
        start,
        end,
        pricing.amount,
        notes.trim(),
        createdAt
      ]
    });
  } catch (e) {
    const err = new Error('Could not create booking — slot may have been taken');
    err.status = 409;
    throw err;
  }

  return getBookingById(id);
}

async function checkInBooking(id, { amountReceived, discount, paymentMode } = {}) {
  const existing = await getBookingById(id);
  if (!existing) {
    const err = new Error('Booking not found');
    err.status = 404;
    throw err;
  }
  if (existing.status === 'cancelled') {
    const err = new Error('Cannot check in a cancelled booking');
    err.status = 400;
    throw err;
  }

  const validModes = ['cash', 'upi', 'card', 'other'];
  const mode = String(paymentMode || '').trim().toLowerCase();
  if (!validModes.includes(mode)) {
    const err = new Error('Payment mode is required (cash, upi, card, or other)');
    err.status = 400;
    throw err;
  }

  const discountNum = Math.max(0, Number(discount) || 0);
  if (discountNum > existing.amount) {
    const err = new Error('Discount cannot exceed the booked amount');
    err.status = 400;
    throw err;
  }

  let received =
    amountReceived != null && amountReceived !== ''
      ? Number(amountReceived)
      : Math.max(0, existing.amount - discountNum);
  if (!Number.isFinite(received) || received < 0) {
    const err = new Error('Amount received must be a valid non-negative number');
    err.status = 400;
    throw err;
  }

  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE bookings
          SET checked_in = 1, discount = ?, amount_received = ?, payment_mode = ?, checked_in_at = ?
          WHERE id = ?`,
    args: [discountNum, received, mode, new Date().toISOString(), id]
  });
  if (result.rowsAffected === 0) {
    const err = new Error('Booking not found');
    err.status = 404;
    throw err;
  }
  return getBookingById(id);
}

async function setCheckedIn(id, checkedIn = true) {
  if (!checkedIn) {
    const db = getDb();
    const result = await db.execute({
      sql: `UPDATE bookings
            SET checked_in = 0, discount = 0, amount_received = NULL, payment_mode = NULL, checked_in_at = NULL
            WHERE id = ?`,
      args: [id]
    });
    if (result.rowsAffected === 0) {
      const err = new Error('Booking not found');
      err.status = 404;
      throw err;
    }
    return getBookingById(id);
  }
  const err = new Error('Use checkInBooking to mark checked-in with payment details');
  err.status = 400;
  throw err;
}

async function cancelBooking(id, reason = '') {
  const db = getDb();
  const reasonText = String(reason || '').trim().slice(0, 500);
  const result = await db.execute({
    sql: `UPDATE bookings
          SET status = 'cancelled', cancel_reason = ?
          WHERE id = ? AND status != 'cancelled'`,
    args: [reasonText || '', id]
  });
  if (result.rowsAffected === 0) {
    const existing = await getBookingById(id);
    if (!existing) {
      const err = new Error('Booking not found');
      err.status = 404;
      throw err;
    }
  }
  return getBookingById(id);
}

function mapBooking(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    bookingDate: row.booking_date,
    slotStart: row.slot_start,
    slotEnd: row.slot_end,
    slotLabel: slotLabel(row.slot_start, row.slot_end),
    amount: row.amount,
    discount: Number(row.discount) || 0,
    amountReceived: row.amount_received != null ? Number(row.amount_received) : null,
    paymentMode: row.payment_mode || '',
    checkedInAt: row.checked_in_at || null,
    notes: row.notes || '',
    status: row.status,
    checkedIn: Boolean(row.checked_in),
    cancelReason: row.cancel_reason || '',
    createdAt: row.created_at
  };
}

async function listBookingsByUser(userId) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM bookings WHERE user_id = ?
          ORDER BY booking_date DESC, slot_start DESC`,
    args: [userId]
  });
  return result.rows.map(mapBooking);
}

module.exports = {
  getAvailability,
  getBookingById,
  getBookingsForDate,
  listBookings,
  listBookingsByUser,
  createBooking,
  checkInBooking,
  setCheckedIn,
  cancelBooking
};
