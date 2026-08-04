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

async function listBookings({ from, to, limit = 100 } = {}) {
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
    notes = ''
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

async function setCheckedIn(id, checkedIn = true) {
  const db = getDb();
  const result = await db.execute({
    sql: 'UPDATE bookings SET checked_in = ? WHERE id = ?',
    args: [checkedIn ? 1 : 0, id]
  });
  if (result.rowsAffected === 0) {
    const err = new Error('Booking not found');
    err.status = 404;
    throw err;
  }
  return getBookingById(id);
}

async function cancelBooking(id) {
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status != 'cancelled'`,
    args: [id]
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
    notes: row.notes || '',
    status: row.status,
    checkedIn: Boolean(row.checked_in),
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
  setCheckedIn,
  cancelBooking
};
