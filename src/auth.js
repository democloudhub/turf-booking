const crypto = require('crypto');

const ADMIN_COOKIE = 'turf_admin_session';
const USER_COOKIE = 'turf_user_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || 'dev-insecure-secret';
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const next = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(next, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createAdminSessionToken() {
  return sign({ role: 'admin', exp: Date.now() + SESSION_TTL_MS });
}

function createUserSessionToken(user) {
  return sign({
    role: 'user',
    userId: user.id,
    email: user.email,
    name: user.name,
    exp: Date.now() + SESSION_TTL_MS
  });
}

function setAdminSessionCookie(res, token) {
  res.cookie(ADMIN_COOKIE, token, cookieOptions());
}

function clearAdminSessionCookie(res) {
  res.clearCookie(ADMIN_COOKIE);
}

function setUserSessionCookie(res, token) {
  res.cookie(USER_COOKIE, token, cookieOptions());
}

function clearUserSessionCookie(res) {
  res.clearCookie(USER_COOKIE);
}

function requireAdmin(req, res, next) {
  const session = verify(req.cookies?.[ADMIN_COOKIE]);
  if (!session || session.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.admin = session;
  return next();
}

function requireUser(req, res, next) {
  const session = verify(req.cookies?.[USER_COOKIE]);
  if (!session || session.role !== 'user' || !session.userId) {
    return res.status(401).json({ error: 'Please log in to continue', code: 'LOGIN_REQUIRED' });
  }
  req.user = session;
  return next();
}

function optionalUser(req, _res, next) {
  const session = verify(req.cookies?.[USER_COOKIE]);
  if (session && session.role === 'user') {
    req.user = session;
  }
  next();
}

function optionalAdmin(req, _res, next) {
  const session = verify(req.cookies?.[ADMIN_COOKIE]);
  if (session && session.role === 'admin') {
    req.admin = session;
  }
  next();
}

async function adminLogin(password) {
  const { verifyAdminPassword } = require('./settings');
  const ok = await verifyAdminPassword(password);
  if (!ok) return null;
  return createAdminSessionToken();
}

module.exports = {
  ADMIN_COOKIE,
  USER_COOKIE,
  hashPassword,
  verifyPassword,
  createUserSessionToken,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  setUserSessionCookie,
  clearUserSessionCookie,
  requireAdmin,
  requireUser,
  optionalUser,
  optionalAdmin,
  adminLogin,
  // backward-compatible aliases used by admin routes
  login: adminLogin,
  setSessionCookie: setAdminSessionCookie,
  clearSessionCookie: clearAdminSessionCookie,
  verify
};
