(async function () {
  const { api, formatMoney, showAlert, escapeHtml, isValidMobile, bindMobileInput, normalizeMobileInput } = TurfApp;

  const alertBox = document.getElementById('alertBox');
  const loginPanel = document.getElementById('loginPanel');
  const adminPanel = document.getElementById('adminPanel');
  const logoutBtn = document.getElementById('logoutBtn');
  const adminNavUser = document.getElementById('adminNavUser');
  const adminHello = document.getElementById('adminHello');
  const adminAvatar = document.getElementById('adminAvatar');
  let currentCheckinId = null;
  let pendingCancelId = null;

  bindMobileInput(document.getElementById('adminMobile'));

  async function checkAuth() {
    try {
      const me = await api('/api/admin/me');
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
    logoutBtn.hidden = true;
    if (adminNavUser) adminNavUser.hidden = true;
  }

  function showAdmin(profile) {
    loginPanel.hidden = true;
    adminPanel.hidden = false;
    logoutBtn.hidden = false;
    updateAdminNav(profile);
  }

  function updateAdminNav(profile) {
    if (!adminNavUser) return;
    const name = profile && profile.name ? String(profile.name).trim() : '';
    const first = name.split(/\s+/)[0] || 'Admin';
    const initial = (name.charAt(0) || 'A').toUpperCase();
    adminHello.textContent = `Hello! ${first}`;
    adminAvatar.textContent = initial;
    adminNavUser.hidden = false;
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: document.getElementById('password').value })
      });
      const me = await api('/api/admin/me');
      showAdmin(me.profile);
      await Promise.all([loadBookings(), loadVenueForm(), loadProfileForm(me.profile), loadEmailForm(), refreshPushStatus()]);
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST', body: '{}' });
    showLogin();
  });

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      ['bookings', 'checkin', 'venue', 'account', 'notifications'].forEach((name) => {
        document.getElementById(`tab-${name}`).hidden = name !== tab;
      });
    });
  });

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
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const data = await api(`/api/admin/bookings?${params.toString()}`);
    const body = document.getElementById('bookingsBody');
    body.innerHTML = data.bookings
      .map((b) => {
        const status = b.checkedIn
          ? '<span class="badge text-bg-success">Checked-in</span>'
          : b.status === 'cancelled'
            ? '<span class="badge text-bg-secondary">Cancelled</span>'
            : '<span class="badge text-bg-primary">Confirmed</span>';
        const actions =
          b.status === 'cancelled'
            ? ''
            : `<button class="btn btn-sm btn-outline-success me-1" data-checkin="${escapeHtml(b.id)}">Check-in</button>
               <button class="btn btn-sm btn-outline-danger" data-cancel="${escapeHtml(b.id)}">Cancel</button>`;
        return `<tr>
          <td><code>${escapeHtml(b.id)}</code></td>
          <td>${escapeHtml(b.bookingDate)}</td>
          <td>${escapeHtml(b.slotLabel)}</td>
          <td>${escapeHtml(b.name)}</td>
          <td>${escapeHtml(b.mobile)}</td>
          <td>${formatMoney(b.amount)}</td>
          <td>${status}</td>
          <td class="text-nowrap">${actions}</td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-checkin]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const result = await api(`/api/admin/bookings/${btn.dataset.checkin}/check-in`, {
            method: 'POST',
            body: JSON.stringify({ checkedIn: true })
          });
          const parts = (result.notifications || []).map((n) => {
            if (n.skipped) return `${n.channel}: skipped`;
            if (n.ok) return `${n.channel}: sent`;
            return `${n.channel}: failed`;
          });
          showAlert(
            alertBox,
            `Checked in. Notifications — ${parts.join(' · ') || 'none'}`,
            'success'
          );
          loadBookings();
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
    return match ? match[0].toUpperCase() : value.toUpperCase();
  }

  document.getElementById('lookupBtn').addEventListener('click', async () => {
    alertBox.innerHTML = '';
    const id = parseBookingId(document.getElementById('checkinId').value);
    try {
      const data = await api(`/api/admin/bookings/${encodeURIComponent(id)}`);
      currentCheckinId = data.booking.id;
      document.getElementById('checkinResult').textContent = JSON.stringify(data.booking, null, 2);
      document.getElementById('checkinBtn').disabled = data.booking.status === 'cancelled';
    } catch (err) {
      currentCheckinId = null;
      document.getElementById('checkinBtn').disabled = true;
      showAlert(alertBox, err.message);
    }
  });

  document.getElementById('checkinBtn').addEventListener('click', async () => {
    if (!currentCheckinId) return;
    try {
      const result = await api(`/api/admin/bookings/${currentCheckinId}/check-in`, {
        method: 'POST',
        body: JSON.stringify({ checkedIn: true })
      });
      const parts = (result.notifications || []).map((n) => {
        if (n.skipped) return `${n.channel}: skipped`;
        if (n.ok) return `${n.channel}: sent`;
        return `${n.channel}: failed`;
      });
      showAlert(
        alertBox,
        `Checked in ${currentCheckinId}. Notifications — ${parts.join(' · ') || 'none'}`,
        'success'
      );
      document.getElementById('lookupBtn').click();
      loadBookings();
    } catch (err) {
      showAlert(alertBox, err.message);
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

  checkAuth();
})();
