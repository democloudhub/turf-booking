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
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('booking:'))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* ignore */
  }
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
  const initial = user
    ? escapeHtml((user.name || 'U').trim().charAt(0).toUpperCase() || 'U')
    : '';
  const html = user
    ? `<a class="btn btn-sm btn-turf" href="/book">Book</a>
       <div class="nav-user-cluster">
         <span class="nav-hello">Hello! ${escapeHtml((user.name || '').trim().split(/\s+/)[0] || 'there')}</span>
         <div class="user-menu">
           <button type="button" class="user-menu-toggle" aria-expanded="false" aria-haspopup="true" aria-label="${escapeHtml(user.name)} account menu" title="${escapeHtml(user.name)}">
             <span class="user-avatar" aria-hidden="true">${initial}</span>
           </button>
           <ul class="user-menu-list" role="menu">
             <li role="none"><a role="menuitem" href="/account?tab=bookings">My Booking</a></li>
             <li role="none"><a role="menuitem" href="/account?tab=profile">Profile</a></li>
             <li role="none"><a role="menuitem" href="/account?tab=password">Change Password</a></li>
             <li role="none"><button type="button" role="menuitem" data-logout>Logout</button></li>
           </ul>
         </div>
       </div>`
    : `<a class="nav-link text-white" href="/availability">Availability</a>
       <a class="btn btn-sm btn-turf" href="${loginUrl('/book')}">Book</a>`;

  slots.forEach((el) => {
    el.innerHTML = html;
    el.querySelectorAll('[data-logout]').forEach((btn) => {
      btn.addEventListener('click', () => logoutUser());
    });
    const menu = el.querySelector('.user-menu');
    if (!menu) return;
    const toggle = menu.querySelector('.user-menu-toggle');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  if (!window.__turfUserMenuBound) {
    window.__turfUserMenuBound = true;
    document.addEventListener('click', () => {
      document.querySelectorAll('.user-menu.open').forEach((menu) => {
        menu.classList.remove('open');
        const toggle = menu.querySelector('.user-menu-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  return user;
}

function isValidMobile(value) {
  return /^\d{10}$/.test(String(value || '').replace(/\D/g, ''));
}

function normalizeMobileInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function bindMobileInput(input) {
  if (!input) return;
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('maxlength', '10');
  input.setAttribute('pattern', '\\d{10}');
  input.setAttribute('title', 'Enter a 10-digit mobile number');
  input.addEventListener('input', () => {
    input.value = normalizeMobileInput(input.value);
  });
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
  loginUrl,
  isValidMobile,
  normalizeMobileInput,
  bindMobileInput
};
