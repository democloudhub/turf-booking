async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    credentials: 'same-origin',
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function formatMoney(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function loginUrl(nextPath) {
  const next = nextPath || `${window.location.pathname}${window.location.search}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

async function getCurrentUser() {
  try {
    const data = await api('/api/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

async function logoutUser() {
  await api('/api/auth/logout', { method: 'POST', body: '{}' });
  window.location.href = '/';
}

async function requireLoginOrRedirect(nextPath) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = loginUrl(nextPath);
    return null;
  }
  return user;
}

async function renderAuthNav() {
  const slots = document.querySelectorAll('[data-auth-nav]');
  if (!slots.length) return null;
  const user = await getCurrentUser();
  const html = user
    ? `<a class="nav-link text-white" href="/account">${escapeHtml(user.name.split(' ')[0])}</a>
       <a class="nav-link text-white" href="/book">Book</a>
       <button type="button" class="btn btn-sm btn-outline-light" data-logout>Logout</button>`
    : `<a class="nav-link text-white" href="/availability">Availability</a>
       <a class="nav-link text-white" href="${loginUrl('/book')}">Login</a>
       <a class="btn btn-sm btn-turf" href="${loginUrl('/book')}">Book</a>`;

  slots.forEach((el) => {
    el.innerHTML = html;
    el.querySelectorAll('[data-logout]').forEach((btn) => {
      btn.addEventListener('click', () => logoutUser());
    });
  });
  return user;
}

async function loadVenueIntoPage() {
  try {
    const venue = await api('/api/venue');
    document.querySelectorAll('[data-venue-name]').forEach((el) => {
      el.textContent = venue.name;
    });
    document.querySelectorAll('[data-venue-address]').forEach((el) => {
      el.textContent = venue.address;
    });
    document.querySelectorAll('[data-venue-phone]').forEach((el) => {
      el.textContent = venue.phone;
      if (el.tagName === 'A') el.href = `tel:${venue.phone}`;
    });
    document.querySelectorAll('[data-venue-maps]').forEach((el) => {
      if (el.tagName === 'A') el.href = venue.mapsUrl || '#';
    });
    document.querySelectorAll('[data-venue-hours]').forEach((el) => {
      el.textContent = `${formatHour(venue.openHour)} – ${formatHour(venue.closeHour)}`;
    });
    document.querySelectorAll('[data-weekday-price]').forEach((el) => {
      el.textContent = formatMoney(venue.weekdayPrice);
    });
    document.querySelectorAll('[data-weekend-price]').forEach((el) => {
      el.textContent = formatMoney(venue.weekendPrice);
    });

    const rulesEl = document.querySelector('[data-venue-rules]');
    if (rulesEl) {
      const rules = String(venue.rules || '')
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      rulesEl.innerHTML = rules.map((r) => `<li>${escapeHtml(r)}</li>`).join('');
    }

    const gallery = document.querySelector('[data-venue-gallery]');
    if (gallery && Array.isArray(venue.images)) {
      gallery.innerHTML = venue.images
        .slice(0, 3)
        .map((src) => `<img src="${escapeAttr(src)}" alt="${escapeAttr(venue.name)}" loading="lazy">`)
        .join('');
    }

    return venue;
  } catch (err) {
    console.error(err);
    return null;
  }
}

function formatHour(hour) {
  const h = Number(hour);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

function showAlert(container, message, type = 'danger') {
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type}" role="alert">${escapeHtml(message)}</div>`;
}

window.TurfApp = {
  api,
  todayISO,
  qs,
  formatMoney,
  loadVenueIntoPage,
  formatHour,
  showAlert,
  escapeHtml,
  getCurrentUser,
  requireLoginOrRedirect,
  renderAuthNav,
  logoutUser,
  loginUrl
};
