(async function () {
  const { api, formatMoney, showAlert, escapeHtml, isValidMobile, bindMobileInput, normalizeMobileInput } = TurfApp;

  const alertBox = document.getElementById('alertBox');
  const loginPanel = document.getElementById('loginPanel');
  const adminPanel = document.getElementById('adminPanel');
  const logoutBtn = document.getElementById('logoutBtn');
  const adminTopBar = document.getElementById('adminTopBar');
  const adminNavUser = document.getElementById('adminNavUser');
  const adminHello = document.getElementById('adminHello');
  const adminAvatar = document.getElementById('adminAvatar');
  const ADMIN_TABS = ['bookings', 'walkin', 'checkin', 'customers', 'venue', 'account', 'notifications'];
  const PRIMARY_TABS = new Set(['bookings', 'walkin', 'checkin', 'customers']);
  let pendingCancelId = null;
  let checkinModal = null;

  bindMobileInput(document.getElementById('adminMobile'));
  bindMobileInput(document.getElementById('walkinMobile'));

  const walkinCustomerStatus = document.getElementById('walkinCustomerStatus');
  let walkinExistingUser = null;

  function setWalkinCustomerStatus(message, kind) {
    if (!walkinCustomerStatus) return;
    walkinCustomerStatus.textContent = message;
    walkinCustomerStatus.className =
      kind === 'existing'
        ? 'form-text text-success'
        : kind === 'new'
          ? 'form-text text-primary'
          : 'form-text';
  }

  async function lookupWalkinCustomer() {
    const mobile = document.getElementById('walkinMobile').value.trim();
    if (!isValidMobile(mobile)) {
      walkinExistingUser = null;
      setWalkinCustomerStatus('Enter a 10-digit mobile to check if the customer exists.');
      return;
    }
    try {
      const data = await api(`/api/admin/customers/lookup?mobile=${encodeURIComponent(mobile)}`);
      if (data.exists && data.user) {
        walkinExistingUser = data.user;
        document.getElementById('walkinName').value = data.user.name || '';
        document.getElementById('walkinEmail').value = data.user.email || '';
        setWalkinCustomerStatus(`Existing customer: ${data.user.name} (${data.user.email})`, 'existing');
      } else {
        walkinExistingUser = null;
        setWalkinCustomerStatus('New customer — fill name and email to create an account.', 'new');
      }
    } catch (err) {
      walkinExistingUser = null;
      setWalkinCustomerStatus(err.message || 'Could not look up customer.');
    }
  }

  document.getElementById('walkinMobile').addEventListener('input', () => {
    const mobile = document.getElementById('walkinMobile').value.trim();
    if (mobile.length < 10) {
      walkinExistingUser = null;
      setWalkinCustomerStatus('Enter a 10-digit mobile to check if the customer exists.');
    }
  });
  document.getElementById('walkinMobile').addEventListener('blur', () => {
    lookupWalkinCustomer().catch(() => {});
  });
  document.getElementById('walkinMobile').addEventListener('change', () => {
    lookupWalkinCustomer().catch(() => {});
  });

  function todayISO() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  const walkinDate = document.getElementById('walkinDate');
  const walkinSlotGrid = document.getElementById('walkinSlotGrid');
  const walkinSlotStart = document.getElementById('walkinSlotStart');
  const walkinPriceLabel = document.getElementById('walkinPriceLabel');
  const walkinTotal = document.getElementById('walkinTotal');
  const walkinCustomPrice = document.getElementById('walkinCustomPrice');
  if (walkinDate) {
    walkinDate.min = todayISO();
    walkinDate.value = todayISO();
  }

  async function loadWalkinSlots() {
    if (!walkinDate || !walkinSlotGrid) return;
    walkinSlotGrid.innerHTML = '<div class="text-muted">Loading slots…</div>';
    walkinSlotStart.value = '';
    walkinTotal.textContent = '—';
    walkinPriceLabel.textContent = '';
    if (walkinCustomPrice) {
      walkinCustomPrice.value = '';
      walkinCustomPrice.placeholder = 'Optional — overrides slot rate';
    }
    const data = await api(`/api/admin/availability?date=${encodeURIComponent(walkinDate.value)}`);
    walkinSlotGrid.innerHTML = '';
    data.slots.forEach((slot) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `slot-chip ${slot.available ? 'available' : 'booked'}`;
      btn.disabled = !slot.available;
      btn.innerHTML = `<strong>${escapeHtml(slot.label)}</strong><span class="price">${slot.available ? formatMoney(slot.price) : 'Booked'}</span>`;
      if (slot.available) {
        btn.addEventListener('click', () => {
          walkinSlotGrid.querySelectorAll('.slot-chip').forEach((el) => el.classList.remove('selected'));
          btn.classList.add('selected');
          walkinSlotStart.value = String(slot.start);
          walkinTotal.textContent = formatMoney(slot.price);
          walkinPriceLabel.textContent = slot.priceLabel || '';
          if (walkinCustomPrice) {
            walkinCustomPrice.placeholder = `Standard: ${formatMoney(slot.price)}`;
            walkinCustomPrice.value = '';
          }
        });
      }
      walkinSlotGrid.appendChild(btn);
    });
  }

  if (walkinDate) {
    walkinDate.addEventListener('change', () => {
      loadWalkinSlots().catch((err) => showAlert(alertBox, err.message));
    });
  }
  if (walkinCustomPrice) {
    walkinCustomPrice.addEventListener('input', () => {
      const raw = walkinCustomPrice.value.trim();
      if (raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0) {
        walkinTotal.textContent = formatMoney(Number(raw));
      }
    });
  }

  document.getElementById('walkinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    const name = document.getElementById('walkinName').value.trim();
    const mobile = document.getElementById('walkinMobile').value.trim();
    const email = document.getElementById('walkinEmail').value.trim();
    const bookingDate = walkinDate.value;
    const notes = document.getElementById('walkinNotes').value.trim();
    if (!isValidMobile(mobile)) {
      showAlert(alertBox, 'Phone number must be exactly 10 digits.');
      return;
    }
    if (walkinSlotStart.value === '') {
      showAlert(alertBox, 'Select an available slot.');
      return;
    }
    const slotStart = Number(walkinSlotStart.value);
    const customPriceRaw = walkinCustomPrice ? walkinCustomPrice.value.trim() : '';
    const payload = {
      name,
      mobile,
      email,
      bookingDate,
      slotStart,
      notes,
      onPremise: true
    };
    if (customPriceRaw !== '') {
      const custom = Number(customPriceRaw);
      if (!Number.isFinite(custom) || custom < 0) {
        showAlert(alertBox, 'Custom price must be a valid non-negative amount.');
        return;
      }
      payload.customAmount = custom;
    }
    const submitBtn = document.getElementById('walkinSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Booking…';
    try {
      const result = await api('/api/admin/bookings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const accountNote = result.accountCreated
        ? 'New customer account created — set-password email sent.'
        : 'Existing customer account used.';
      showAlert(
        alertBox,
        `Booked ${result.booking.id}. ${accountNote} Confirmation email sent.`,
        'success'
      );
      document.getElementById('walkinForm').reset();
      walkinExistingUser = null;
      setWalkinCustomerStatus('Enter a 10-digit mobile to check if the customer exists.');
      walkinDate.value = todayISO();
      walkinSlotStart.value = '';
      walkinTotal.textContent = '—';
      await loadWalkinSlots();
      await loadBookings();
    } catch (err) {
      showAlert(alertBox, err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Book & notify';
    }
  });

  async function checkAuth() {
    try {
      const me = await api('/api/admin/me');
      const next = new URLSearchParams(window.location.search).get('next');
      if (next && next.startsWith('/')) {
        window.location.href = next;
        return true;
      }
      showAdmin(me.profile);
      await Promise.all([loadBookings(), loadVenueForm(), loadProfileForm(me.profile), loadEmailForm(), refreshPushStatus()]);
      return true;
    } catch {
      showLogin();
      return false;
    }
  }

  function showLogin() {
    loginPanel.hidden = false;
    adminPanel.hidden = true;
    if (adminTopBar) adminTopBar.hidden = true;
    const menu = document.getElementById('adminUserMenu');
    if (menu) menu.classList.remove('open');
  }

  function showAdmin(profile) {
    loginPanel.hidden = true;
    adminPanel.hidden = false;
    if (adminTopBar) adminTopBar.hidden = false;
    updateAdminNav(profile);
  }

  function updateAdminNav(profile) {
    if (!adminHello || !adminAvatar) return;
    const name = profile && profile.name ? String(profile.name).trim() : '';
    const first = name.split(/\s+/)[0] || 'Admin';
    const initial = (name.charAt(0) || 'A').toUpperCase();
    adminHello.textContent = `Hello! ${first}`;
    adminAvatar.textContent = initial;
  }

  function switchTab(tab) {
    if (!ADMIN_TABS.includes(tab)) return;
    document.querySelectorAll('.admin-top-tabs [data-tab]').forEach((b) => {
      b.classList.toggle('active', PRIMARY_TABS.has(tab) && b.dataset.tab === tab);
    });
    ADMIN_TABS.forEach((name) => {
      const panel = document.getElementById(`tab-${name}`);
      if (panel) panel.hidden = name !== tab;
    });
    if (tab === 'walkin') {
      loadWalkinSlots().catch((err) => showAlert(alertBox, err.message));
    }
    if (tab === 'customers') {
      loadCustomers().catch((err) => showAlert(alertBox, err.message));
    }
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: document.getElementById('password').value })
      });
      const next = new URLSearchParams(window.location.search).get('next');
      if (next && next.startsWith('/')) {
        window.location.href = next;
        return;
      }
      const me = await api('/api/admin/me');
      showAdmin(me.profile);
      await Promise.all([loadBookings(), loadVenueForm(), loadProfileForm(me.profile), loadEmailForm(), refreshPushStatus()]);
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });

  const adminMenu = document.getElementById('adminUserMenu');
  const adminMenuToggle = document.getElementById('adminMenuToggle');
  if (adminMenuToggle && adminMenu) {
    adminMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = adminMenu.classList.toggle('open');
      adminMenuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  document.addEventListener('click', () => {
    if (!adminMenu) return;
    adminMenu.classList.remove('open');
    if (adminMenuToggle) adminMenuToggle.setAttribute('aria-expanded', 'false');
  });

  logoutBtn.addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST', body: '{}' });
    showLogin();
  });

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      if (adminMenu) {
        adminMenu.classList.remove('open');
        if (adminMenuToggle) adminMenuToggle.setAttribute('aria-expanded', 'false');
      }
    });
  });

  async function loadCustomers() {
    const q = document.getElementById('customerSearch')?.value.trim() || '';
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const data = await api(`/api/admin/customers?${params.toString()}`);
    const body = document.getElementById('customersBody');
    const totals = data.totals || {};
    document.getElementById('statCustomers').textContent = String(totals.customers || 0);
    document.getElementById('statConfirmed').textContent = String(totals.confirmed || 0);
    document.getElementById('statCheckedIn').textContent = String(totals.checkedIn || 0);
    document.getElementById('statCancelled').textContent = String(totals.cancelled || 0);
    document.getElementById('statRevenue').textContent = formatMoney(totals.revenue || 0);

    if (!data.customers.length) {
      body.innerHTML = '<tr><td colspan="8" class="text-muted p-3">No customers found.</td></tr>';
      return;
    }
    body.innerHTML = data.customers
      .map((c) => {
        const b = c.bookings || {};
        return `<tr>
          <td class="fw-semibold">${escapeHtml(c.name || '—')}</td>
          <td>${escapeHtml(c.mobile || '—')}</td>
          <td>${escapeHtml(c.email || '—')}</td>
          <td class="text-center">${b.confirmed || 0}</td>
          <td class="text-center">${b.checkedIn || 0}</td>
          <td class="text-center">${b.cancelled || 0}</td>
          <td class="text-center">${b.total || 0}</td>
          <td class="text-end fw-semibold">${formatMoney(c.revenue || 0)}</td>
        </tr>`;
      })
      .join('');
  }

  const reloadCustomersBtn = document.getElementById('reloadCustomers');
  if (reloadCustomersBtn) {
    reloadCustomersBtn.addEventListener('click', () => {
      loadCustomers().catch((err) => showAlert(alertBox, err.message));
    });
  }
  const customerSearch = document.getElementById('customerSearch');
  if (customerSearch) {
    customerSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadCustomers().catch((err) => showAlert(alertBox, err.message));
      }
    });
  }

  async function loadProfileForm(profile) {
    const data = profile || (await api('/api/admin/profile'));
    const form = document.getElementById('profileForm');
    form.name.value = data.name || '';
    form.email.value = data.email || '';
    form.mobile.value = normalizeMobileInput(data.mobile || '');
    updateAdminNav(data);
  }

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    const form = e.target;
    const mobile = form.mobile.value.trim();
    if (mobile && !isValidMobile(mobile)) {
      showAlert(alertBox, 'Mobile number must be exactly 10 digits.');
      return;
    }
    try {
      const profile = await api('/api/admin/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          mobile
        })
      });
      await loadProfileForm(profile);
      showAlert(alertBox, 'Admin profile saved. Booking emails will go to this address.', 'success');
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });

  const cancelModal = document.getElementById('cancelModal');
  const cancelReasonInput = document.getElementById('cancelReasonInput');

  function openCancelModal(bookingId) {
    pendingCancelId = bookingId;
    document.getElementById('cancelModalBookingId').textContent = bookingId;
    cancelReasonInput.value = '';
    cancelModal.hidden = false;
    cancelReasonInput.focus();
  }

  function closeCancelModal() {
    pendingCancelId = null;
    cancelModal.hidden = true;
    cancelReasonInput.value = '';
  }

  cancelModal.querySelectorAll('[data-cancel-dismiss]').forEach((el) => {
    el.addEventListener('click', () => closeCancelModal());
  });

  document.getElementById('cancelConfirmBtn').addEventListener('click', async () => {
    if (!pendingCancelId) return;
    const bookingId = pendingCancelId;
    const reason = cancelReasonInput.value.trim();
    const btn = document.getElementById('cancelConfirmBtn');
    btn.disabled = true;
    try {
      const result = await api(`/api/admin/bookings/${bookingId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      closeCancelModal();
      const parts = (result.notifications || []).map((n) => {
        if (n.skipped) return `${n.channel}: skipped`;
        if (n.ok) return `${n.channel}: sent`;
        return `${n.channel}: failed`;
      });
      showAlert(
        alertBox,
        `Booking cancelled. Notifications — ${parts.join(' · ') || 'none'}`,
        'success'
      );
      loadBookings();
    } catch (err) {
      showAlert(alertBox, err.message);
    } finally {
      btn.disabled = false;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !cancelModal.hidden) closeCancelModal();
  });

  async function loadBookings() {
    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;
    const q = document.getElementById('bookingSearch').value.trim();
    const status = document.getElementById('bookingStatusFilter').value;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    const data = await api(`/api/admin/bookings?${params.toString()}`);
    const body = document.getElementById('bookingsBody');
    if (!data.bookings.length) {
      body.innerHTML = '<tr><td colspan="8" class="text-muted p-3">No bookings match your filters.</td></tr>';
      return;
    }
    body.innerHTML = data.bookings
      .map((b) => {
        const statusBadge = b.checkedIn
          ? '<span class="badge text-bg-success">Checked-in</span>'
          : b.status === 'cancelled'
            ? '<span class="badge text-bg-secondary">Cancelled</span>'
            : '<span class="badge text-bg-primary">Confirmed</span>';
        console.log(b.status);
            const actions =
          b.status === 'cancelled' || b.status === 'checked-in'
            ? `<a class="btn btn-sm btn-outline-secondary" href="/confirmation?id=${encodeURIComponent(b.id)}&from=admin">View</a>`
            : `<a class="btn btn-sm btn-outline-secondary me-1" href="/confirmation?id=${encodeURIComponent(b.id)}&from=admin">View</a>
               <button class="btn btn-sm btn-outline-success me-1" data-checkin="${escapeHtml(b.id)}">Check-in</button>
               <button class="btn btn-sm btn-outline-danger" data-cancel="${escapeHtml(b.id)}">Cancel</button>`;
        return `<tr>
          <td><code><a href="/confirmation?id=${encodeURIComponent(b.id)}&from=admin">${escapeHtml(b.id)}</a></code></td>
          <td>${escapeHtml(b.bookingDate)}</td>
          <td>${escapeHtml(b.slotLabel)}</td>
          <td>${escapeHtml(b.name)}</td>
          <td>${escapeHtml(b.mobile)}</td>
          <td>${formatMoney(b.amount)}</td>
          <td>${statusBadge}</td>
          <td class="text-nowrap">${actions}</td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-checkin]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const data = await api(`/api/admin/bookings/${encodeURIComponent(btn.dataset.checkin)}`);
          if (checkinModal) checkinModal.openCheckinModal(data.booking);
        } catch (err) {
          showAlert(alertBox, err.message);
        }
      });
    });
    body.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => openCancelModal(btn.dataset.cancel));
    });
  }

  document.getElementById('reloadBookings').addEventListener('click', () => {
    loadBookings().catch((err) => showAlert(alertBox, err.message));
  });
  document.getElementById('bookingSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadBookings().catch((err) => showAlert(alertBox, err.message));
    }
  });
  document.getElementById('bookingStatusFilter').addEventListener('change', () => {
    loadBookings().catch((err) => showAlert(alertBox, err.message));
  });

  function parseBookingId(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    try {
      const parsed = JSON.parse(value);
      if (parsed && parsed.bookingId) return parsed.bookingId;
    } catch {
      /* plain id */
    }
    const match = value.match(/TB-[A-Z0-9]+/i);
    if (match) return match[0].toUpperCase();
    const urlMatch = value.match(/confirmation\?id=([^&\s]+)/i);
    if (urlMatch) return decodeURIComponent(urlMatch[1]).toUpperCase();
    return value.toUpperCase();
  }

  document.getElementById('lookupBtn').addEventListener('click', () => {
    alertBox.innerHTML = '';
    const id = parseBookingId(document.getElementById('checkinId').value);
    if (!id) {
      showAlert(alertBox, 'Enter a valid booking ID.');
      return;
    }
    window.location.href = `/confirmation?id=${encodeURIComponent(id)}&from=admin`;
  });

  document.getElementById('checkinId').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('lookupBtn').click();
    }
  });

  async function loadVenueForm() {
    const venue = await api('/api/admin/venue');
    const form = document.getElementById('venueForm');
    form.name.value = venue.name;
    form.phone.value = venue.phone;
    form.address.value = venue.address;
    form.mapsUrl.value = venue.mapsUrl || '';
    form.openHour.value = venue.openHour;
    form.closeHour.value = venue.closeHour;
    form.weekdayPrice.value = venue.weekdayPrice;
    form.weekendPrice.value = venue.weekendPrice;
    form.holidayPrice.value = venue.holidayPrice ?? '';
    form.holidays.value = (venue.holidays || []).join(', ');
    form.rules.value = venue.rules || '';
    form.images.value = (venue.images || []).join('\n');
  }

  document.getElementById('venueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const holidays = form.holidays.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const images = form.images.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api('/api/admin/venue', {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name.value,
          phone: form.phone.value,
          address: form.address.value,
          mapsUrl: form.mapsUrl.value,
          openHour: Number(form.openHour.value),
          closeHour: Number(form.closeHour.value),
          weekdayPrice: Number(form.weekdayPrice.value),
          weekendPrice: Number(form.weekendPrice.value),
          holidayPrice: form.holidayPrice.value === '' ? null : Number(form.holidayPrice.value),
          holidays,
          rules: form.rules.value,
          images
        })
      });
      showAlert(alertBox, 'Venue settings saved.', 'success');
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });

  document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    if (newPassword !== confirmPassword) {
      showAlert(alertBox, 'New password and confirmation do not match.');
      return;
    }
    try {
      await api('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      document.getElementById('passwordForm').reset();
      showAlert(alertBox, 'Admin password updated. Use the new password next time you log in.', 'success');
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });

  async function loadEmailForm() {
    const statusEl = document.getElementById('emailStatus');
    try {
      const cfg = await api('/api/admin/email');
      document.getElementById('resendFrom').value = cfg.from || 'Turf Booking <onboarding@resend.dev>';
      document.getElementById('resendApiKey').value = '';
      document.getElementById('resendApiKey').placeholder = cfg.hasApiKey
        ? 'Saved — leave blank to keep'
        : 're_...';
      if (statusEl) {
        statusEl.textContent = cfg.configured
          ? `Resend is configured. From: ${cfg.from}`
          : 'Resend is not configured yet.';
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message;
    }
  }

  document.getElementById('emailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    try {
      const payload = {
        from: document.getElementById('resendFrom').value.trim()
      };
      const apiKey = document.getElementById('resendApiKey').value.trim();
      if (apiKey) payload.apiKey = apiKey;
      const cfg = await api('/api/admin/email', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      await loadEmailForm();
      showAlert(
        alertBox,
        cfg.configured
          ? 'Resend settings saved. Booking emails will use the Resend API.'
          : 'Email settings saved, but configuration is still incomplete.',
        'success'
      );
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });

  document.getElementById('emailTestBtn').addEventListener('click', async () => {
    alertBox.innerHTML = '';
    try {
      const result = await api('/api/admin/email/test', {
        method: 'POST',
        body: '{}'
      });
      if (result.ok) {
        showAlert(alertBox, 'Test email sent to your admin profile address.', 'success');
      } else if (result.skipped) {
        showAlert(alertBox, `Test skipped: ${result.reason || 'not configured'}`);
      } else {
        showAlert(alertBox, 'Test email failed.');
      }
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
  }

  async function refreshPushStatus() {
    const statusEl = document.getElementById('pushStatus');
    if (!statusEl) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      statusEl.textContent = 'Push notifications are not supported in this browser.';
      return;
    }
    const permission = Notification.permission;
    let subscribed = false;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      subscribed = Boolean(sub);
    } catch {
      subscribed = false;
    }
    if (permission === 'granted' && subscribed) {
      statusEl.textContent = 'Chrome notifications are enabled on this browser.';
    } else if (permission === 'denied') {
      statusEl.textContent = 'Notifications are blocked. Allow them in Chrome site settings.';
    } else {
      statusEl.textContent = 'Chrome notifications are not enabled yet.';
    }
  }

  async function enablePush() {
    alertBox.innerHTML = '';
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      showAlert(alertBox, 'Push notifications are not supported in this browser. Use Chrome.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showAlert(alertBox, 'Notification permission was not granted.');
        await refreshPushStatus();
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const { publicKey } = await api('/api/admin/push/vapid-public-key');
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }
      await api('/api/admin/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription })
      });
      showAlert(alertBox, 'Chrome notifications enabled for new bookings.', 'success');
      await refreshPushStatus();
    } catch (err) {
      showAlert(alertBox, err.message || 'Failed to enable notifications');
      await refreshPushStatus();
    }
  }

  async function disablePush() {
    alertBox.innerHTML = '';
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await api('/api/admin/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
        await sub.unsubscribe();
      }
      showAlert(alertBox, 'Chrome notifications disabled on this browser.', 'success');
    } catch (err) {
      showAlert(alertBox, err.message || 'Failed to disable notifications');
    }
    await refreshPushStatus();
  }

  document.getElementById('enablePushBtn').addEventListener('click', enablePush);
  document.getElementById('disablePushBtn').addEventListener('click', disablePush);

  checkinModal = TurfCheckinModal.init({
    api,
    showAlert,
    formatMoney,
    alertBox,
    onSuccess: async () => {
      await loadBookings();
    }
  });

  checkAuth();
})();
