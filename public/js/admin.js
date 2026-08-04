(async function () {
  const { api, formatMoney, showAlert, escapeHtml } = TurfApp;

  const alertBox = document.getElementById('alertBox');
  const loginPanel = document.getElementById('loginPanel');
  const adminPanel = document.getElementById('adminPanel');
  const logoutBtn = document.getElementById('logoutBtn');
  let currentCheckinId = null;

  async function checkAuth() {
    try {
      await api('/api/admin/me');
      showAdmin();
      await Promise.all([loadBookings(), loadVenueForm()]);
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
  }

  function showAdmin() {
    loginPanel.hidden = true;
    adminPanel.hidden = false;
    logoutBtn.hidden = false;
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: document.getElementById('password').value })
      });
      showAdmin();
      await Promise.all([loadBookings(), loadVenueForm()]);
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
      ['bookings', 'checkin', 'venue', 'security'].forEach((name) => {
        document.getElementById(`tab-${name}`).hidden = name !== tab;
      });
    });
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
        await api(`/api/admin/bookings/${btn.dataset.checkin}/check-in`, {
          method: 'POST',
          body: JSON.stringify({ checkedIn: true })
        });
        loadBookings();
      });
    });
    body.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Cancel this booking? The customer will be notified by email / WhatsApp / SMS.')) return;
        const reason = window.prompt('Cancellation reason (optional):', '') || '';
        try {
          const result = await api(`/api/admin/bookings/${btn.dataset.cancel}/cancel`, {
            method: 'POST',
            body: JSON.stringify({ reason })
          });
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
        }
      });
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
    await api(`/api/admin/bookings/${currentCheckinId}/check-in`, {
      method: 'POST',
      body: JSON.stringify({ checkedIn: true })
    });
    showAlert(alertBox, `Checked in ${currentCheckinId}`, 'success');
    document.getElementById('lookupBtn').click();
    loadBookings();
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

  checkAuth();
})();
