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
  if (!email && (process.env.ADMIN_EMAIL || process.env.GMAIL_USER || process.env.SMTP_USER)) {
    await setSetting(
      'admin_email',
      String(process.env.ADMIN_EMAIL || process.env.GMAIL_USER || process.env.SMTP_USER).trim()
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

async function ensureGmailConfigSeeded() {
  const keys = [
    ['gmail_user', process.env.GMAIL_USER || process.env.SMTP_USER],
    ['gmail_client_id', process.env.GMAIL_CLIENT_ID],
    ['gmail_client_secret', process.env.GMAIL_CLIENT_SECRET],
    ['gmail_refresh_token', process.env.GMAIL_REFRESH_TOKEN],
    ['gmail_from', process.env.GMAIL_FROM || process.env.SMTP_FROM]
  ];
  for (const [key, value] of keys) {
    if (!value) continue;
    const existing = await getSetting(key);
    if (!existing) await setSetting(key, String(value).trim());
  }
}

async function getGmailConfig() {
  await ensureGmailConfigSeeded();
  const [user, clientId, clientSecret, refreshToken, from] = await Promise.all([
    getSetting('gmail_user'),
    getSetting('gmail_client_id'),
    getSetting('gmail_client_secret'),
    getSetting('gmail_refresh_token'),
    getSetting('gmail_from')
  ]);

  const resolvedUser =
    user || process.env.GMAIL_USER || process.env.SMTP_USER || '';
  const resolvedClientId = clientId || process.env.GMAIL_CLIENT_ID || '';
  const resolvedClientSecret = clientSecret || process.env.GMAIL_CLIENT_SECRET || '';
  const resolvedRefreshToken = refreshToken || process.env.GMAIL_REFRESH_TOKEN || '';
  const resolvedFrom =
    from ||
    process.env.GMAIL_FROM ||
    process.env.SMTP_FROM ||
    (resolvedUser ? `Turf Booking <${resolvedUser}>` : '');

  return {
    user: resolvedUser,
    clientId: resolvedClientId,
    clientSecret: resolvedClientSecret,
    refreshToken: resolvedRefreshToken,
    from: resolvedFrom,
    configured: Boolean(
      resolvedUser && resolvedClientId && resolvedClientSecret && resolvedRefreshToken
    )
  };
}

async function getGmailConfigPublic() {
  const cfg = await getGmailConfig();
  return {
    user: cfg.user,
    clientId: cfg.clientId,
    from: cfg.from,
    hasClientSecret: Boolean(cfg.clientSecret),
    hasRefreshToken: Boolean(cfg.refreshToken),
    configured: cfg.configured
  };
}

async function updateGmailConfig(patch = {}) {
  const current = await getGmailConfig();
  const nextUser = patch.user !== undefined ? String(patch.user || '').trim() : current.user;
  const nextClientId =
    patch.clientId !== undefined ? String(patch.clientId || '').trim() : current.clientId;
  const nextFrom = patch.from !== undefined ? String(patch.from || '').trim() : current.from;

  let nextClientSecret = current.clientSecret;
  if (patch.clientSecret !== undefined && String(patch.clientSecret).trim()) {
    nextClientSecret = String(patch.clientSecret).trim();
  }

  let nextRefreshToken = current.refreshToken;
  if (patch.refreshToken !== undefined && String(patch.refreshToken).trim()) {
    nextRefreshToken = String(patch.refreshToken).trim();
  }

  if (!nextUser || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextUser)) {
    const err = new Error('A valid Gmail address is required');
    err.status = 400;
    throw err;
  }
  if (!nextClientId) {
    const err = new Error('Gmail OAuth Client ID is required');
    err.status = 400;
    throw err;
  }
  if (!nextClientSecret) {
    const err = new Error('Gmail OAuth Client Secret is required');
    err.status = 400;
    throw err;
  }
  if (!nextRefreshToken) {
    const err = new Error('Gmail OAuth Refresh Token is required');
    err.status = 400;
    throw err;
  }

  await Promise.all([
    setSetting('gmail_user', nextUser),
    setSetting('gmail_client_id', nextClientId),
    setSetting('gmail_client_secret', nextClientSecret),
    setSetting('gmail_refresh_token', nextRefreshToken),
    setSetting('gmail_from', nextFrom || `Turf Booking <${nextUser}>`)
  ]);
  return getGmailConfigPublic();
}

module.exports = {
  getSetting,
  setSetting,
  ensureAdminPasswordSeeded,
  ensureAdminProfileSeeded,
  ensureGmailConfigSeeded,
  verifyAdminPassword,
  changeAdminPassword,
  getAdminProfile,
  updateAdminProfile,
  getGmailConfig,
  getGmailConfigPublic,
  updateGmailConfig
};
