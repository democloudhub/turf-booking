/**
 * One-time helper to obtain a Gmail OAuth refresh token (no passwords).
 *
 * Prerequisites:
 * 1. Google Cloud Console → APIs & Services → enable "Gmail API"
 * 2. Create OAuth client (Desktop app, or Web with redirect http://localhost:3333/oauth2callback)
 * 3. Put GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET in .env (or pass as args)
 *
 * Usage:
 *   npm run gmail-oauth
 *   npm run gmail-oauth -- --client-id=... --client-secret=...
 */
require('dotenv').config();
const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.GMAIL_OAUTH_PORT || 3333);
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = 'https://mail.google.com/';

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

const clientId = argValue('client-id') || process.env.GMAIL_CLIENT_ID || '';
const clientSecret = argValue('client-secret') || process.env.GMAIL_CLIENT_SECRET || '';

if (!clientId || !clientSecret) {
  console.error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET.');
  console.error('Add them to .env or pass --client-id=... --client-secret=...');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }
  return data;
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    if (reqUrl.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const err = reqUrl.searchParams.get('error');
    if (err) throw new Error(err);
    const code = reqUrl.searchParams.get('code');
    if (!code) throw new Error('Missing authorization code');

    const tokens = await exchangeCode(code);
    const refreshToken = tokens.refresh_token || '';
    const html = `<!doctype html><html><body style="font-family:system-ui;max-width:720px;margin:2rem auto;padding:0 1rem">
      <h1>Gmail OAuth connected</h1>
      <p>Copy these into <code>.env</code> / Vercel / Admin → Notifications:</p>
      <pre style="background:#f4f6f3;padding:1rem;border-radius:8px;overflow:auto">GMAIL_CLIENT_ID=${clientId}
GMAIL_CLIENT_SECRET=${clientSecret}
GMAIL_REFRESH_TOKEN=${refreshToken}</pre>
      ${refreshToken ? '' : '<p style="color:#b00020"><strong>No refresh_token returned.</strong> Revoke app access at Google Account → Security → Third-party access, then run again with prompt=consent.</p>'}
      <p>You can close this tab.</p>
    </body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);

    console.log('\n=== Gmail OAuth success ===');
    console.log('GMAIL_CLIENT_ID=' + clientId);
    console.log('GMAIL_CLIENT_SECRET=' + clientSecret);
    console.log('GMAIL_REFRESH_TOKEN=' + refreshToken);
    if (!refreshToken) {
      console.warn('No refresh_token. Revoke prior consent and run again.');
    }
    setTimeout(() => process.exit(0), 500);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(e.message || e));
    console.error(e);
    setTimeout(() => process.exit(1), 300);
  }
});

server.listen(PORT, () => {
  console.log('Gmail OAuth setup');
  console.log('Redirect URI (must match Google Cloud client):', REDIRECT_URI);
  console.log('\nOpen this URL in your browser:\n');
  console.log(authUrl.toString());
  console.log('\nWaiting for Google callback on port', PORT, '...');
});
