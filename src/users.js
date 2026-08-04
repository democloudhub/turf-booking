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
      String(mobile).trim(),
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
  const db = getDb();
  await db.execute({
    sql: 'UPDATE users SET name = ?, mobile = ? WHERE id = ?',
    args: [String(name).trim(), String(mobile).trim(), userId]
  });
  return mapUser(await findUserById(userId));
}

module.exports = {
  registerUser,
  authenticateUser,
  findUserById,
  findUserByEmail,
  updateUserProfile,
  mapUser
};
