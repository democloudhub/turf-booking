const { getDb } = require('./db');

async function getVenue() {
  const db = getDb();
  const result = await db.execute('SELECT * FROM venue WHERE id = 1');
  if (!result.rows.length) {
    throw new Error('Venue not configured');
  }
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    mapsUrl: row.maps_url,
    contactEmail: row.contact_email,
    rules: row.rules,
    images: safeJson(row.images, []),
    openHour: row.open_hour,
    closeHour: row.close_hour,
    weekdayPrice: row.weekday_price,
    weekendPrice: row.weekend_price,
    holidayPrice: row.holiday_price,
    holidays: safeJson(row.holidays, [])
  };
}

async function updateVenue(patch) {
  const current = await getVenue();
  const next = {
    name: patch.name ?? current.name,
    address: patch.address ?? current.address,
    phone: patch.phone ?? current.phone,
    maps_url: patch.mapsUrl ?? current.mapsUrl,
    contact_email: patch.contactEmail ?? current.contactEmail,
    rules: patch.rules ?? current.rules,
    images: JSON.stringify(patch.images ?? current.images),
    open_hour: Number(patch.openHour ?? current.openHour),
    close_hour: Number(patch.closeHour ?? current.closeHour),
    weekday_price: Number(patch.weekdayPrice ?? current.weekdayPrice),
    weekend_price: Number(patch.weekendPrice ?? current.weekendPrice),
    holiday_price:
      patch.holidayPrice === undefined
        ? current.holidayPrice
        : patch.holidayPrice === null || patch.holidayPrice === ''
          ? null
          : Number(patch.holidayPrice),
    holidays: JSON.stringify(patch.holidays ?? current.holidays)
  };

  const db = getDb();
  await db.execute({
    sql: `UPDATE venue SET
      name = ?, address = ?, phone = ?, maps_url = ?, contact_email = ?,
      rules = ?, images = ?, open_hour = ?, close_hour = ?,
      weekday_price = ?, weekend_price = ?, holiday_price = ?, holidays = ?
      WHERE id = 1`,
    args: [
      next.name,
      next.address,
      next.phone,
      next.maps_url,
      next.contact_email,
      next.rules,
      next.images,
      next.open_hour,
      next.close_hour,
      next.weekday_price,
      next.weekend_price,
      next.holiday_price,
      next.holidays
    ]
  });
  return getVenue();
}

function safeJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isWeekend(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isHoliday(dateStr, holidays) {
  return Array.isArray(holidays) && holidays.includes(dateStr);
}

function getPriceForDate(venue, dateStr) {
  if (isHoliday(dateStr, venue.holidays) && venue.holidayPrice != null) {
    return { amount: venue.holidayPrice, label: 'Holiday' };
  }
  if (isWeekend(dateStr)) {
    return { amount: venue.weekendPrice, label: 'Weekend' };
  }
  return { amount: venue.weekdayPrice, label: 'Weekday' };
}

function formatHour(hour) {
  const h = Number(hour);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
}

function slotLabel(start, end) {
  return `${formatHour(start)} – ${formatHour(end)}`;
}

function generateHourlySlots(openHour, closeHour) {
  const slots = [];
  for (let h = openHour; h < closeHour; h += 1) {
    slots.push({ start: h, end: h + 1, label: slotLabel(h, h + 1) });
  }
  return slots;
}

module.exports = {
  getVenue,
  updateVenue,
  getPriceForDate,
  isWeekend,
  isHoliday,
  formatHour,
  slotLabel,
  generateHourlySlots
};
