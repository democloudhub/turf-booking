const path = require('path');
const fs = require('fs');

function isVercel() {
  return Boolean(process.env.VERCEL || process.env.NOW_REGION);
}

function resolveUrl() {
  const remote =
    process.env.TURSO_DATABASE_URL ||
    process.env.LIBSQL_URL ||
    (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('file:')
      ? process.env.DATABASE_URL
      : null);

  if (remote) {
    return remote;
  }

  if (isVercel()) {
    const err = new Error(
      'Missing TURSO_DATABASE_URL. Local SQLite (file:) cannot run on Vercel. Create a free Turso database and set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN in the Vercel project environment variables.'
    );
    err.code = 'TURSO_REQUIRED';
    throw err;
  }

  const url = process.env.DATABASE_URL || 'file:./data/local.db';
  if (url.startsWith('file:')) {
    const filePath = url.replace(/^file:/, '');
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    return `file:${abs}`;
  }
  return url;
}

function createDbClient(url) {
  const opts = { url };
  if (process.env.TURSO_AUTH_TOKEN) {
    opts.authToken = process.env.TURSO_AUTH_TOKEN;
  }

  // Local file DB needs the Node driver. Remote Turso on Vercel must use the
  // HTTP `/web` client — the default TCP path times out from serverless.
  if (url.startsWith('file:')) {
    const { createClient } = require('@libsql/client');
    return createClient(opts);
  }

  const { createClient } = require('@libsql/client/web');
  return createClient(opts);
}

let client;
let resolveError = null;

function getDb() {
  if (resolveError) throw resolveError;
  if (!client) {
    try {
      client = createDbClient(resolveUrl());
    } catch (err) {
      resolveError = err;
      throw err;
    }
  }
  return client;
}

async function ensureSchema() {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS venue (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      maps_url TEXT,
      contact_email TEXT,
      rules TEXT,
      images TEXT,
      open_hour INTEGER NOT NULL DEFAULT 6,
      close_hour INTEGER NOT NULL DEFAULT 22,
      weekday_price REAL NOT NULL DEFAULT 800,
      weekend_price REAL NOT NULL DEFAULT 1000,
      holiday_price REAL,
      holidays TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      mobile TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      email TEXT NOT NULL,
      booking_date TEXT NOT NULL,
      slot_start INTEGER NOT NULL,
      slot_end INTEGER NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed',
      cancel_reason TEXT,
      checked_in INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date)
  `);

  try {
    await db.execute('ALTER TABLE bookings ADD COLUMN user_id TEXT');
  } catch {
    /* column already exists */
  }

  try {
    await db.execute('ALTER TABLE bookings ADD COLUMN cancel_reason TEXT');
  } catch {
    /* column already exists */
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  const { ensureAdminPasswordSeeded, ensureAdminProfileSeeded, ensureResendConfigSeeded } = require('./settings');
  await ensureAdminPasswordSeeded();
  await ensureAdminProfileSeeded();
  await ensureResendConfigSeeded();
  const { ensureVapidKeys } = require('./notify/push');
  await ensureVapidKeys();

  const existing = await db.execute('SELECT id FROM venue WHERE id = 1');
  if (existing.rows.length === 0) {
    const defaultImages = JSON.stringify([
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200',
      'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1200',
      'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=1200'
    ]);
    const defaultRules = [
      'Wear appropriate sports shoes - no metal studs.',
      'Arrive 10 minutes before your slot.',
      'Cancellations must be made at least 4 hours in advance.',
      'No smoking or alcohol on the premises.',
      'Damage to property will be charged to the booker.',
      'Children must be supervised by an adult.'
    ].join('\n');

    await db.execute({
      sql: `INSERT INTO venue (
        id, name, address, phone, maps_url, contact_email, rules, images,
        open_hour, close_hour, weekday_price, weekend_price, holiday_price, holidays
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        process.env.VENUE_NAME || 'GreenField Turf',
        process.env.VENUE_ADDRESS || '123 Sports Complex, Your City',
        process.env.VENUE_PHONE || '+919876543210',
        process.env.VENUE_MAPS_URL || 'https://maps.google.com/?q=GreenField+Turf',
        process.env.RESEND_FROM || process.env.ADMIN_EMAIL || process.env.GMAIL_USER || process.env.SMTP_USER || '',
        defaultRules,
        defaultImages,
        Number(process.env.VENUE_OPEN_HOUR || 6),
        Number(process.env.VENUE_CLOSE_HOUR || 22),
        Number(process.env.WEEKDAY_PRICE || 800),
        Number(process.env.WEEKEND_PRICE || 1000),
        null,
        '[]'
      ]
    });
  }
}

module.exports = { getDb, ensureSchema, isVercel };
