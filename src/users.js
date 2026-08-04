const crypto = require('crypto');
const { getDb } = require('./db');
const { hashPassword, verifyPassword } = require('./auth');

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    createdAt: row.created_at
  };
}

function normalizeMobileInput(mobile) {
  return String(mobile || '').replace(/\D/g, '');
}

function assertValidMobile(mobile) {
  const digits = normalizeMobileInput(mobile);
  if (!/^\d{10}$/.test(digits)) {
    const err = new Error('Mobile number must be exactly 10 digits');
    err.status = 400;
    throw err;
  }
  return digits;
}

async function findUserByEmail(email) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE email = ?',
    args: [String(email).trim().toLowerCase()]
  });
  return result.rows[0] || null;
}

async function findUserById(id) {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [id]
  });
  return result.rows[0] || null;
}

async function registerUser({ name, email, mobile, password }) {
  if (!name || !email || !mobile || !password) {
    const err = new Error('Name, email, mobile, and password are required');
    err.status = 400;
    throw err;
  }
  if (String(password).length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.status = 400;
    throw err;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    const err = new Error('Enter a valid email address');
    err.status = 400;
    throw err;
  }

  const mobileDigits = assertValidMobile(mobile);

  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }

  const id = `U-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO users (id, name, email, mobile, password_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      String(name).trim(),
      normalizedEmail,
      mobileDigits,
      hashPassword(password),
      createdAt
    ]
  });

  return mapUser(await findUserById(id));
}

async function authenticateUser(email, password) {
  const row = await findUserByEmail(email);
  if (!row || !verifyPassword(password, row.password_hash)) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }
  return mapUser(row);
}

async function updateUserProfile(userId, { name, mobile }) {
  if (!name || !mobile) {
    const err = new Error('Name and mobile are required');
    err.status = 400;
    throw err;
  }
  const mobileDigits = assertValidMobile(mobile);
  const db = getDb();
  await db.execute({
    sql: 'UPDATE users SET name = ?, mobile = ? WHERE id = ?',
    args: [String(name).trim(), mobileDigits, userId]
  });
  return mapUser(await findUserById(userId));
}

async function changeUserPassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    const err = new Error('Current and new password are required');
    err.status = 400;
    throw err;
  }
  if (String(newPassword).length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.status = 400;
    throw err;
  }
  const row = await findUserById(userId);
  if (!row) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (!verifyPassword(currentPassword, row.password_hash)) {
    const err = new Error('Current password is incorrect');
    err.status = 401;
    throw err;
  }
  const db = getDb();
  await db.execute({
    sql: 'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?',
    args: [hashPassword(newPassword), userId]
  });
  return true;
}

async function findOrCreateCustomer({ name, email, mobile }) {
  if (!name || !email || !mobile) {
    const err = new Error('Name, email, and mobile are required');
    err.status = 400;
    throw err;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    const err = new Error('Enter a valid email address');
    err.status = 400;
    throw err;
  }
  const mobileDigits = assertValidMobile(mobile);
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    const db = getDb();
    await db.execute({
      sql: 'UPDATE users SET name = ?, mobile = ? WHERE id = ?',
      args: [String(name).trim(), mobileDigits, existing.id]
    });
    return {
      user: mapUser(await findUserById(existing.id)),
      created: false,
      resetToken: null
    };
  }

  const id = `U-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const randomPassword = crypto.randomBytes(24).toString('hex');
  const resetToken = crypto.randomBytes(24).toString('hex');
  const resetExpires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO users (
            id, name, email, mobile, password_hash,
            password_reset_token, password_reset_expires, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      String(name).trim(),
      normalizedEmail,
      mobileDigits,
      hashPassword(randomPassword),
      resetToken,
      resetExpires,
      createdAt
    ]
  });

  return {
    user: mapUser(await findUserById(id)),
    created: true,
    resetToken
  };
}

async function createPasswordResetToken(email) {
  const row = await findUserByEmail(email);
  if (!row) {
    // Do not reveal whether the email exists.
    return { ok: true, sent: false };
  }
  const resetToken = crypto.randomBytes(24).toString('hex');
  const resetExpires = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour
  const db = getDb();
  await db.execute({
    sql: 'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?',
    args: [resetToken, resetExpires, row.id]
  });
  return {
    ok: true,
    sent: true,
    user: mapUser(row),
    resetToken
  };
}

async function resetPasswordWithToken(token, newPassword) {
  if (!token || !newPassword) {
    const err = new Error('Reset token and new password are required');
    err.status = 400;
    throw err;
  }
  if (String(newPassword).length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.status = 400;
    throw err;
  }
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE password_reset_token = ?',
    args: [String(token)]
  });
  const row = result.rows[0];
  if (!row) {
    const err = new Error('Invalid or expired reset link');
    err.status = 400;
    throw err;
  }
  if (!row.password_reset_expires || Date.now() > Date.parse(row.password_reset_expires)) {
    const err = new Error('This reset link has expired. Request a new one.');
    err.status = 400;
    throw err;
  }
  await db.execute({
    sql: `UPDATE users
          SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL
          WHERE id = ?`,
    args: [hashPassword(newPassword), row.id]
  });
  return mapUser(await findUserById(row.id));
}

module.exports = {
  registerUser,
  authenticateUser,
  findUserById,
  findUserByEmail,
  updateUserProfile,
  changeUserPassword,
  findOrCreateCustomer,
  createPasswordResetToken,
  resetPasswordWithToken,
  assertValidMobile,
  mapUser
};
