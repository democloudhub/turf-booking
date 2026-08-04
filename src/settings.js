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

module.exports = {
  getSetting,
  setSetting,
  ensureAdminPasswordSeeded,
  verifyAdminPassword,
  changeAdminPassword
};
