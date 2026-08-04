(async function () {
  const { api, qs, formatMoney, loadVenueIntoPage, showAlert, requireLoginOrRedirect, renderAuthNav, loginUrl } =
    TurfApp;
  await loadVenueIntoPage();

  const id = qs('id');
  const alertBox = document.getElementById('alertBox');
  const card = document.getElementById('confirmCard');

  if (!id) {
    await renderAuthNav();
    showAlert(alertBox, 'Missing booking ID.');
    return;
  }

  const next = `/confirmation?id=${encodeURIComponent(id)}${qs('from') === 'admin' ? '&from=admin' : ''}`;

  async function isAdminLoggedIn() {
    try {
      await api('/api/admin/me');
      return true;
    } catch {
      return false;
    }
  }

  const asAdmin = await isAdminLoggedIn();
  const fromAdminLink = qs('from') === 'admin';
  // Check-in / Cancel are admin-only and only on admin email/list links.
  const showAdminTools = asAdmin && fromAdminLink;

  if (!showAdminTools) {
    if (fromAdminLink && !asAdmin) {
      window.location.href = `/admin?next=${encodeURIComponent(`${next}&from=admin`)}`;
      return;
    }
    const user = await requireLoginOrRedirect(next);
    if (!user) return;
    await renderAuthNav();
  } else {
    await renderAuthNav();
  }

  let currentBooking = null;

  function renderBooking(data) {
    const b = data.booking;
    currentBooking = b;

    let statusClass = 'confirmed';
    let statusLabel = 'Confirmed';
    if (b.status === 'cancelled') {
      statusClass = 'cancelled';
      statusLabel = 'Cancelled';
    } else if (b.checkedIn) {
      statusClass = 'checked-in';
      statusLabel = 'Checked-In';
    }

    const statusEl = document.getElementById('bookingStatus');
    statusEl.className = `status-block status-block-lg ${statusClass}`;
    statusEl.textContent = statusLabel;

    document.getElementById('bookingId').textContent = b.id;
    document.getElementById('cName').textContent = b.name;
    document.getElementById('cDate').textContent = b.bookingDate;
    document.getElementById('cSlot').textContent = b.slotLabel;
    document.getElementById('cAmount').textContent = formatMoney(b.amount);
    document.getElementById('cMobile').textContent = b.mobile;
    document.getElementById('qrImage').src = data.qrDataUrl;
    document.getElementById('pdfBtn').href = `/api/bookings/${encodeURIComponent(b.id)}/receipt.pdf`;

    const reasonRow = document.getElementById('cancelReasonRow');
    const reasonEl = document.getElementById('cCancelReason');
    if (b.status === 'cancelled' && b.cancelReason) {
      reasonEl.textContent = b.cancelReason;
      reasonRow.hidden = false;
    } else {
      reasonEl.textContent = '';
      reasonRow.hidden = true;
    }

    const qrWrap = document.getElementById('qrWrap');
    const pdfBtn = document.getElementById('pdfBtn');
    if (b.status === 'cancelled') {
      qrWrap.hidden = true;
      pdfBtn.hidden = true;
      document.getElementById('confirmHint').textContent = b.cancelReason
        ? `This booking was cancelled. Reason: ${b.cancelReason}`
        : 'This booking was cancelled.';
    } else if (b.checkedIn) {
      qrWrap.hidden = false;
      pdfBtn.hidden = false;
      document.getElementById('confirmHint').textContent = 'Checked in at the venue.';
    } else {
      qrWrap.hidden = false;
      pdfBtn.hidden = false;
      document.getElementById('confirmHint').textContent = showAdminTools
        ? 'Admin view — you can check in or cancel this booking.'
        : 'Show this QR code at the venue for check-in.';
    }

    const customerActions = document.getElementById('customerActions');
    const adminActions = document.getElementById('adminActions');
    if (showAdminTools) {
      customerActions.hidden = true;
      adminActions.hidden = false;
      const canAct = b.status !== 'cancelled';
      document.getElementById('adminCheckinBtn').disabled = !canAct || Boolean(b.checkedIn);
      document.getElementById('adminCancelBtn').disabled = !canAct;
      document.getElementById('adminCheckinBtn').textContent = b.checkedIn ? 'Already checked in' : 'Check-in';
    } else {
      customerActions.hidden = false;
      adminActions.hidden = true;
    }

    if (data.notifications) {
      const parts = data.notifications.map((n) => {
        if (n.skipped) return `${n.channel}: skipped`;
        if (n.ok) return `${n.channel}: sent`;
        return `${n.channel}: failed`;
      });
      document.getElementById('notifyStatus').textContent = `Notifications — ${parts.join(' · ')}`;
    }

    card.hidden = false;
  }

  async function loadBooking() {
    const data = await api(`/api/bookings/${encodeURIComponent(id)}`);
    sessionStorage.setItem(`booking:${id}`, JSON.stringify(data));
    renderBooking(data);
  }

  try {
    await loadBooking();
  } catch (err) {
    if ((err.code === 'LOGIN_REQUIRED' || err.status === 401) && qs('from') === 'admin') {
      window.location.href = `/admin?next=${encodeURIComponent(next)}`;
      return;
    }
    if (err.code === 'LOGIN_REQUIRED' || err.status === 401) {
      window.location.href = loginUrl(next);
      return;
    }
    showAlert(alertBox, err.message);
    return;
  }

  if (!showAdminTools) return;

  const cancelModal = document.getElementById('cancelModal');
  const cancelReasonInput = document.getElementById('cancelReasonInput');

  function openCancelModal() {
    if (!currentBooking) return;
    document.getElementById('cancelModalBookingId').textContent = currentBooking.id;
    cancelReasonInput.value = '';
    cancelModal.hidden = false;
    cancelReasonInput.focus();
  }

  function closeCancelModal() {
    cancelModal.hidden = true;
    cancelReasonInput.value = '';
  }

  cancelModal.querySelectorAll('[data-cancel-dismiss]').forEach((el) => {
    el.addEventListener('click', () => closeCancelModal());
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !cancelModal.hidden) closeCancelModal();
  });

  document.getElementById('adminCheckinBtn').addEventListener('click', async () => {
    if (!currentBooking) return;
    try {
      const result = await api(`/api/admin/bookings/${currentBooking.id}/check-in`, {
        method: 'POST',
        body: JSON.stringify({ checkedIn: true })
      });
      const parts = (result.notifications || []).map((n) => {
        if (n.skipped) return `${n.channel}: skipped`;
        if (n.ok) return `${n.channel}: sent`;
        return `${n.channel}: failed`;
      });
      showAlert(alertBox, `Checked in. Notifications — ${parts.join(' · ') || 'none'}`, 'success');
      await loadBooking();
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });

  document.getElementById('adminCancelBtn').addEventListener('click', () => openCancelModal());

  document.getElementById('cancelConfirmBtn').addEventListener('click', async () => {
    if (!currentBooking) return;
    const btn = document.getElementById('cancelConfirmBtn');
    btn.disabled = true;
    try {
      const result = await api(`/api/admin/bookings/${currentBooking.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReasonInput.value.trim() })
      });
      closeCancelModal();
      const parts = (result.notifications || []).map((n) => {
        if (n.skipped) return `${n.channel}: skipped`;
        if (n.ok) return `${n.channel}: sent`;
        return `${n.channel}: failed`;
      });
      showAlert(alertBox, `Booking cancelled. Notifications — ${parts.join(' · ') || 'none'}`, 'success');
      await loadBooking();
    } catch (err) {
      showAlert(alertBox, err.message);
    } finally {
      btn.disabled = false;
    }
  });
})();
