# Turf Booking

Simple single-venue turf booking app: availability by date, online booking, email / WhatsApp / SMS confirmations, PDF receipt + QR check-in, and a lightweight admin panel.

Built for **GitHub + Vercel** with **Turso (LibSQL)** for persistent storage.

## Stack

- Frontend: Bootstrap 5 + vanilla JS
- Backend: Node.js + Express
- Database: Turso / LibSQL (local `file:` SQLite for development)
- Email: Nodemailer (Gmail SMTP)
- WhatsApp + SMS: Twilio
- Calendar: fixed hourly slots

## Features

### Customer
- Register / login required to book
- Home page with turf images, venue info, maps link, contact, rules, hours
- Availability calendar (date picker, available / booked slots, weekday & weekend pricing, optional holiday pricing)
- Booking form (prefilled from account; date, slot, amount, notes)
- My Account — profile + booking history
- Confirmation page with Booking ID, QR code, PDF receipt download
- Email, WhatsApp, and SMS confirmation (when enabled)

### Admin (`/admin`)
- Separate staff password login (cookie session)
- Change admin password from the Password tab (stored hashed in DB)
- Bookings list with check-in / cancel
- Cancelling a booking notifies the customer by email, WhatsApp, and SMS
- QR / Booking ID check-in
- Edit venue details, hours, pricing, holidays, rules, images

## Quick start (local)

```bash
cp .env.example .env
npm install
npm start
```

If `npm install` fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (common on some Windows networks), temporarily run:

```bash
npm install --strict-ssl=false
```

Open [http://localhost:3000](http://localhost:3000).

Default admin password: `admin123` (change `ADMIN_PASSWORD` in `.env`).

Local DB file is created at `data/local.db` automatically.

> Notifications are off by default (`NOTIFY_ENABLED=false`). Bookings still work; messages are logged to the console.

## Environment variables

See [`.env.example`](.env.example). Important values:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Local SQLite, e.g. `file:./data/local.db` |
| `TURSO_DATABASE_URL` | Turso URL for Vercel |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `ADMIN_PASSWORD` | Admin login |
| `ADMIN_SESSION_SECRET` | Cookie signing secret |
| `APP_URL` | Public site URL (used in QR / links) |
| `SMTP_*` | Gmail SMTP for email |
| `TWILIO_*` | SMS + WhatsApp |
| `NOTIFY_ENABLED` | `true` to actually send messages |

### Gmail

1. Enable 2FA on the Google account  
2. Create an [App Password](https://myaccount.google.com/apppasswords)  
3. Set `SMTP_USER` / `SMTP_PASS`

### Twilio WhatsApp

Use the Twilio WhatsApp sandbox (`TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`) for testing, then upgrade to a production WhatsApp sender.

## Deploy on Vercel + GitHub

1. Create a free [Turso](https://turso.tech) database and copy the URL + token.
2. Push this repo to GitHub.
3. Import the repo in [Vercel](https://vercel.com).
4. Set environment variables in the Vercel project:

```
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
APP_URL=https://your-app.vercel.app
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_SMS_FROM=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
NOTIFY_ENABLED=true
NODE_ENV=production
```

5. Deploy. Schema is created automatically on first request.

> Do **not** use a local `file:` database on Vercel — the filesystem is ephemeral. Always use Turso in production.

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create customer account |
| POST | `/api/auth/login` | Customer login |
| POST | `/api/auth/logout` | Customer logout |
| GET | `/api/auth/me` | Current customer profile |
| GET | `/api/auth/my-bookings` | Customer booking history |
| GET | `/api/venue` | Public venue info |
| GET | `/api/bookings/availability?date=YYYY-MM-DD` | Slots for a date |
| POST | `/api/bookings` | Create booking (**login required**) |
| GET | `/api/bookings/:id` | Booking + QR |
| GET | `/api/bookings/:id/receipt.pdf` | PDF receipt (owner login) |
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/bookings` | List bookings |
| POST | `/api/admin/bookings/:id/check-in` | Mark checked-in |
| PUT | `/api/admin/venue` | Update venue settings |

## Project structure

```
api/index.js          Vercel serverless entry
server.js             Express app
src/db.js             LibSQL client + schema
src/bookings.js       Availability & booking logic
src/venue.js          Venue config helpers
src/notify/           Email / SMS / WhatsApp
src/receipt.js        QR + PDF
src/routes/           HTTP routes
public/               Bootstrap customer + admin UI
```

## License

MIT
