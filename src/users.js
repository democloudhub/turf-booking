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

async function findUserByMobile(mobile) {
  const digits = normalizeMobileInput(mobile);
  if (!/^\d{10}$/.test(digits)) return null;
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE mobile = ? LIMIT 1',
    args: [digits]
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

  const byEmail = await findUserByEmail(normalizedEmail);
  const byMobile = await findUserByMobile(mobileDigits);

  if (byEmail && byMobile && byEmail.id !== byMobile.id) {
    const err = new Error(
      'This email and mobile belong to different accounts. Use matching details or update the customer profile.'
    );
    err.status = 409;
    throw err;
  }

  const existing = byEmail || byMobile;
  if (existing) {
    const db = getDb();
    await db.execute({
      sql: 'UPDATE users SET name = ?, mobile = ?, email = ? WHERE id = ?',
      args: [String(name).trim(), mobileDigits, normalizedEmail, existing.id]
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

async function listCustomers({ q = '' } = {}) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT
            COALESCE(NULLIF(b.user_id, ''), lower(b.email), b.mobile) AS customer_key,
            MAX(COALESCE(u.id, b.user_id)) AS user_id,
            MAX(COALESCE(u.name, b.name)) AS name,
            MAX(COALESCE(u.email, b.email)) AS email,
            MAX(COALESCE(u.mobile, b.mobile)) AS mobile,
            MAX(COALESCE(u.created_at, b.created_at)) AS created_at,
            SUM(CASE WHEN b.status != 'cancelled' AND IFNULL(b.checked_in, 0) = 0 THEN 1 ELSE 0 END) AS confirmed,
            SUM(CASE WHEN b.status != 'cancelled' AND IFNULL(b.checked_in, 0) = 1 THEN 1 ELSE 0 END) AS checked_in,
            SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
            COUNT(*) AS total_bookings,
            COALESCE(SUM(CASE WHEN b.status != 'cancelled' THEN b.amount ELSE 0 END), 0) AS revenue
          FROM bookings b
          LEFT JOIN users u ON u.id = b.user_id
          GROUP BY COALESCE(NULLIF(b.user_id, ''), lower(b.email), b.mobile)
          ORDER BY revenue DESC, name ASC`
  });

  let customers = result.rows.map((row) => ({
    id: row.user_id || null,
    key: row.customer_key,
    name: row.name || '',
    email: row.email || '',
    mobile: String(row.mobile || ''),
    createdAt: row.created_at || null,
    bookings: {
      confirmed: Number(row.confirmed) || 0,
      checkedIn: Number(row.checked_in) || 0,
      cancelled: Number(row.cancelled) || 0,
      total: Number(row.total_bookings) || 0
    },
    revenue: Number(row.revenue) || 0
  }));

  // Include registered users who have never booked.
  const usersResult = await db.execute('SELECT * FROM users ORDER BY created_at DESC');
  const seen = new Set(
    customers.map((c) => (c.id || '').toLowerCase()).filter(Boolean)
  );
  const seenEmail = new Set(customers.map((c) => String(c.email || '').toLowerCase()).filter(Boolean));
  const seenMobile = new Set(customers.map((c) => String(c.mobile || '').replace(/\D/g, '')).filter(Boolean));

  for (const row of usersResult.rows) {
    const id = String(row.id || '');
    const email = String(row.email || '').toLowerCase();
    const mobile = String(row.mobile || '').replace(/\D/g, '');
    if (seen.has(id.toLowerCase()) || (email && seenEmail.has(email)) || (mobile && seenMobile.has(mobile))) {
      continue;
    }
    customers.push({
      id,
      key: id,
      name: row.name || '',
      email: row.email || '',
      mobile: String(row.mobile || ''),
      createdAt: row.created_at || null,
      bookings: { confirmed: 0, checkedIn: 0, cancelled: 0, total: 0 },
      revenue: 0
    });
  }

  const query = String(q || '').trim().toLowerCase();
  if (query) {
    const digits = query.replace(/\D/g, '');
    customers = customers.filter((c) => {
      const hay = `${c.name} ${c.email} ${c.mobile} ${c.id || ''}`.toLowerCase();
      return hay.includes(query) || (digits && String(c.mobile).includes(digits));
    });
  }

  return customers;
}

module.exports = {
  registerUser,
  authenticateUser,
  findUserById,
  findUserByEmail,
  findUserByMobile,
  updateUserProfile,
  changeUserPassword,
  findOrCreateCustomer,
  createPasswordResetToken,
  resetPasswordWithToken,
  listCustomers,
  assertValidMobile,
  mapUser
};
