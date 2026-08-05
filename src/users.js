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

  // Fetch all bookings and users separately — avoids complex GROUP BY
  // which can trip up the libsql web client's Row proxy objects.
  const [bookingsRes, usersRes] = await Promise.all([
    db.execute({
      sql: 'SELECT id, user_id, name, email, mobile, status, checked_in, amount, amount_received, created_at FROM bookings ORDER BY created_at DESC',
      args: []
    }),
    db.execute({
      sql: 'SELECT id, name, email, mobile, created_at FROM users ORDER BY created_at DESC',
      args: []
    })
  ]);

  // Build a user map by id for quick lookup
  const userMap = {};
  for (const r of usersRes.rows) {
    const uid = String(r.id || '');
    if (uid) userMap[uid] = { id: uid, name: String(r.name || ''), email: String(r.email || ''), mobile: String(r.mobile || ''), createdAt: r.created_at || null };
  }

  // Aggregate bookings per customer key (user_id if present, else email, else mobile)
  const byKey = {};
  for (const r of bookingsRes.rows) {
    const uid = String(r.user_id || '').trim();
    const email = String(r.email || '').toLowerCase().trim();
    const mobile = String(r.mobile || '').replace(/\D/g, '');
    const key = uid || email || mobile;
    if (!key) continue;

    if (!byKey[key]) {
      const user = uid ? userMap[uid] : null;
      byKey[key] = {
        id: uid || null,
        key,
        name: (user && user.name) || String(r.name || ''),
        email: (user && user.email) || email,
        mobile: (user && user.mobile) || mobile,
        createdAt: (user && user.createdAt) || r.created_at || null,
        bookings: { confirmed: 0, checkedIn: 0, cancelled: 0, total: 0 },
        revenue: 0
      };
    }

    const c = byKey[key];
    const status = String(r.status || '');
    const checkedIn = Number(r.checked_in) === 1;
    const amount = Number(r.amount) || 0;
    const received = r.amount_received != null ? Number(r.amount_received) : null;
    c.bookings.total += 1;
    if (status === 'cancelled') {
      c.bookings.cancelled += 1;
    } else if (checkedIn) {
      c.bookings.checkedIn += 1;
      c.revenue += received != null ? received : amount;
    } else {
      c.bookings.confirmed += 1;
      c.revenue += amount;
    }
    // Keep the most descriptive name/email/mobile from latest bookings
    if (!c.name && r.name) c.name = String(r.name);
    if (!c.email && email) c.email = email;
    if (!c.mobile && mobile) c.mobile = mobile;
  }

  let customers = Object.values(byKey);

  // Include registered users who have never booked
  const seenIds = new Set(customers.map((c) => c.id).filter(Boolean));
  const seenEmails = new Set(customers.map((c) => c.email.toLowerCase()).filter(Boolean));
  const seenMobiles = new Set(customers.map((c) => c.mobile.replace(/\D/g, '')).filter(Boolean));

  for (const u of Object.values(userMap)) {
    const email = u.email.toLowerCase();
    const mobile = u.mobile.replace(/\D/g, '');
    if (seenIds.has(u.id) || (email && seenEmails.has(email)) || (mobile && seenMobiles.has(mobile))) continue;
    customers.push({
      id: u.id,
      key: u.id,
      name: u.name,
      email: u.email,
      mobile: u.mobile,
      createdAt: u.createdAt,
      bookings: { confirmed: 0, checkedIn: 0, cancelled: 0, total: 0 },
      revenue: 0
    });
  }

  // Sort: highest revenue first, then name
  customers.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

  const query = String(q || '').trim().toLowerCase();
  if (query) {
    const digits = query.replace(/\D/g, '');
    customers = customers.filter((c) => {
      const hay = `${c.name} ${c.email} ${c.mobile} ${c.id || ''}`.toLowerCase();
      return hay.includes(query) || (digits && c.mobile.includes(digits));
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
