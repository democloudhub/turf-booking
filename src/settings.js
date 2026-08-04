const { getDb } = require('./db');
const { hashPassword, verifyPassword } = require('./auth');

async function getSetting(key) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: [key]
  });
  return result.rows[0]?.value ?? null;
}

async function setSetting(key, value) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value]
  });
}

async function ensureAdminPasswordSeeded() {
  const existing = await getSetting('admin_password_hash');
  if (existing) return;
  const initial = process.env.ADMIN_PASSWORD || 'admin123';
  await setSetting('admin_password_hash', hashPassword(initial));
}

async function verifyAdminPassword(password) {
  if (!password) return false;
  await ensureAdminPasswordSeeded();
  const stored = await getSetting('admin_password_hash');
  return verifyPassword(password, stored);
}

async function changeAdminPassword(currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    const err = new Error('Current and new password are required');
    err.status = 400;
    throw err;
  }
  if (String(newPassword).length < 6) {
    const err = new Error('New password must be at least 6 characters');
    err.status = 400;
    throw err;
  }
  const ok = await verifyAdminPassword(currentPassword);
  if (!ok) {
    const err = new Error('Current password is incorrect');
    err.status = 401;
    throw err;
  }
  await setSetting('admin_password_hash', hashPassword(newPassword));
  return true;
}

function normalizeAdminMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.slice(0, 10);
}

async function ensureAdminProfileSeeded() {
  const [name, email, mobile] = await Promise.all([
    getSetting('admin_name'),
    getSetting('admin_email'),
    getSetting('admin_mobile')
  ]);
  if (!name && process.env.ADMIN_NAME) {
    await setSetting('admin_name', String(process.env.ADMIN_NAME).trim());
  }
  if (!email && (process.env.ADMIN_EMAIL || process.env.SMTP_USER)) {
    await setSetting(
      'admin_email',
      String(process.env.ADMIN_EMAIL || process.env.SMTP_USER).trim()
    );
  }
  if (!mobile && process.env.ADMIN_MOBILE) {
    await setSetting('admin_mobile', normalizeAdminMobile(process.env.ADMIN_MOBILE));
  }
}

async function getAdminProfile() {
  await ensureAdminProfileSeeded();
  const [name, email, mobile] = await Promise.all([
    getSetting('admin_name'),
    getSetting('admin_email'),
    getSetting('admin_mobile')
  ]);
  return {
    name: name || '',
    email: email || '',
    mobile: mobile || ''
  };
}

async function updateAdminProfile({ name, email, mobile }) {
  const nextName = String(name || '').trim();
  const nextEmail = String(email || '').trim().toLowerCase();
  const nextMobile = normalizeAdminMobile(mobile);

  if (!nextName) {
    const err = new Error('Admin name is required');
    err.status = 400;
    throw err;
  }
  if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    const err = new Error('A valid admin email is required');
    err.status = 400;
    throw err;
  }
  if (nextMobile && nextMobile.length !== 10) {
    const err = new Error('Mobile number must be exactly 10 digits');
    err.status = 400;
    throw err;
  }

  await Promise.all([
    setSetting('admin_name', nextName),
    setSetting('admin_email', nextEmail),
    setSetting('admin_mobile', nextMobile)
  ]);
  return getAdminProfile();
}

async function ensureResendConfigSeeded() {
  const keys = [
    ['resend_api_key', process.env.RESEND_API_KEY],
    [
      'resend_from',
      process.env.RESEND_FROM ||
        process.env.GMAIL_FROM ||
        process.env.SMTP_FROM ||
        'Turf Booking <onboarding@resend.dev>'
    ]
  ];
  for (const [key, value] of keys) {
    if (!value) continue;
    const existing = await getSetting(key);
    if (!existing) await setSetting(key, String(value).trim());
  }
}

async function getResendConfig() {
  await ensureResendConfigSeeded();
  const [apiKey, from] = await Promise.all([
    getSetting('resend_api_key'),
    getSetting('resend_from')
  ]);

  const resolvedKey = apiKey || process.env.RESEND_API_KEY || '';
  const resolvedFrom =
    from ||
    process.env.RESEND_FROM ||
    process.env.GMAIL_FROM ||
    process.env.SMTP_FROM ||
    'Turf Booking <onboarding@resend.dev>';

  return {
    apiKey: resolvedKey,
    from: resolvedFrom,
    configured: Boolean(resolvedKey && resolvedFrom)
  };
}

async function getResendConfigPublic() {
  const cfg = await getResendConfig();
  return {
    from: cfg.from,
    hasApiKey: Boolean(cfg.apiKey),
    configured: cfg.configured
  };
}

async function updateResendConfig(patch = {}) {
  const current = await getResendConfig();
  const nextFrom =
    patch.from !== undefined ? String(patch.from || '').trim() : current.from;

  let nextApiKey = current.apiKey;
  if (patch.apiKey !== undefined && String(patch.apiKey).trim()) {
    nextApiKey = String(patch.apiKey).trim();
  }

  if (!nextApiKey) {
    const err = new Error('Resend API key is required');
    err.status = 400;
    throw err;
  }
  if (!nextFrom) {
    const err = new Error('From address is required (e.g. Turf Booking <onboarding@resend.dev>)');
    err.status = 400;
    throw err;
  }

  await Promise.all([
    setSetting('resend_api_key', nextApiKey),
    setSetting('resend_from', nextFrom)
  ]);
  return getResendConfigPublic();
}

module.exports = {
  getSetting,
  setSetting,
  ensureAdminPasswordSeeded,
  ensureAdminProfileSeeded,
  ensureResendConfigSeeded,
  verifyAdminPassword,
  changeAdminPassword,
  getAdminProfile,
  updateAdminProfile,
  getResendConfig,
  getResendConfigPublic,
  updateResendConfig
};
