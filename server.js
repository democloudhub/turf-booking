require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { ensureSchema } = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

let ready = ensureSchema().catch((err) => {
  console.error('[db] schema init failed:', err);
  throw err;
});

function configErrorPage(err) {
  const message = err && err.message ? err.message : 'Database configuration error';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Setup required</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:4rem auto;padding:0 1rem;line-height:1.5;color:#142018}
code{background:#f3f6f1;padding:.15rem .35rem;border-radius:4px}
.box{border:1px solid #c8dcc9;border-radius:12px;padding:1.25rem;background:#fff}
</style></head><body>
<h1>Turf Booking needs Turso on Vercel</h1>
<div class="box">
<p>${message.replace(/</g, '&lt;')}</p>
<ol>
<li>Create a free DB at <a href="https://turso.tech">turso.tech</a></li>
<li>In Vercel → Project → Settings → Environment Variables, add:
  <ul>
    <li><code>TURSO_DATABASE_URL</code> (libsql://...)</li>
    <li><code>TURSO_AUTH_TOKEN</code></li>
    <li><code>ADMIN_PASSWORD</code></li>
    <li><code>ADMIN_SESSION_SECRET</code></li>
    <li><code>APP_URL</code> (your Vercel URL)</li>
  </ul>
</li>
<li>Redeploy the project</li>
</ol>
<p><a href="/health">Check /health</a></p>
</div></body></html>`;
}

app.use(async (req, res, next) => {
  try {
    await ready;
    next();
  } catch (err) {
    console.error(err);
    if (req.path === '/health' || req.path.startsWith('/api/')) {
      return res.status(503).json({
        ok: false,
        error: err.message || 'Database unavailable',
        code: err.code || 'DB_ERROR'
      });
    }
    return res.status(503).type('html').send(configErrorPage(err));
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(publicDir));

app.use('/api', require('./src/routes/public'));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/bookings', require('./src/routes/bookings'));
app.use('/api/admin', require('./src/routes/admin'));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/account', (_req, res) => {
  res.sendFile(path.join(publicDir, 'account.html'));
});

app.get('/availability', (_req, res) => {
  res.sendFile(path.join(publicDir, 'availability.html'));
});

app.get('/book', (_req, res) => {
  res.sendFile(path.join(publicDir, 'book.html'));
});

app.get('/confirmation', (_req, res) => {
  res.sendFile(path.join(publicDir, 'confirmation.html'));
});

app.get('/health', async (_req, res) => {
  await ready;
  res.json({
    ok: true,
    vercel: Boolean(process.env.VERCEL),
    hasTurso: Boolean(process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL)
  });
});

app.use((err, req, res, _next) => {
  console.error(err);
  if (req.accepts('html') && !req.path.startsWith('/api/')) {
    return res.status(500).type('html').send(configErrorPage(err));
  }
  res.status(500).json({ error: err.message || 'Server error' });
});

if (require.main === module) {
  ready
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Turf Booking running at http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start:', err);
      process.exit(1);
    });
}

module.exports = app;
